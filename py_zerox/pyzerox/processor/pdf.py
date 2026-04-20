import logging
import os
import asyncio
from typing import List, Optional, Tuple
from pdf2image import convert_from_path

# Package Imports
from .image import save_image
from .text import format_markdown
from ..constants import PDFConversionDefaultOptions, Messages
from ..core.types import ErrorMode, PageStatus
from ..models import litellmmodel


async def convert_pdf_to_images(image_density: int, image_height: tuple[Optional[int], int], local_path: str, temp_dir: str) -> List[str]:
    """Converts a PDF file to a series of images in the temp_dir. Returns a list of image paths in page order.
    
    Raises RuntimeError if conversion fails, so callers can handle the error
    according to their error_mode policy.
    """
    options = {
        "pdf_path": local_path,
        "output_folder": temp_dir,
        "dpi": image_density,
        "fmt": PDFConversionDefaultOptions.FORMAT,
        "size": image_height,
        "thread_count": PDFConversionDefaultOptions.THREAD_COUNT,
        "use_pdftocairo": PDFConversionDefaultOptions.USE_PDFTOCAIRO,
        "paths_only": True,
    }

    try:
        image_paths = await asyncio.to_thread(
            convert_from_path, **options
        )
        if image_paths is None:
            raise RuntimeError(
                "PDF to image conversion returned None. "
                "Is poppler installed and in PATH? "
                "See: https://github.com/Belval/pdf2image#how-to-install"
            )
        return image_paths
    except Exception as err:
        logging.error(f"Error converting PDF to images: {err}")
        raise RuntimeError(f"Error converting PDF to images: {err}") from err


async def process_page(
    image: str,
    model: litellmmodel,
    temp_directory: str = "",
    input_token_count: int = 0,
    output_token_count: int = 0,
    prior_page: str = "",
    semaphore: Optional[asyncio.Semaphore] = None,
    error_mode: ErrorMode = ErrorMode.IGNORE,
) -> Tuple[str, int, int, str, PageStatus, Optional[str]]:
    """Process a single page of a PDF.
    
    Returns a tuple of (content, input_tokens, output_tokens, prior_page, status, error_message).
    When error_mode is THROW, exceptions propagate directly.
    When error_mode is IGNORE, errors are captured in the returned status and error_message.
    """

    # If semaphore is provided, acquire it before processing the page
    if semaphore:
        async with semaphore:
            return await process_page(
                image,
                model,
                temp_directory,
                input_token_count,
                output_token_count,
                prior_page,
                error_mode=error_mode,
            )

    image_path = os.path.join(temp_directory, image)

    # Get the completion from LiteLLM
    try:
        completion = await model.completion(
            image_path=image_path,
            maintain_format=True,
            prior_page=prior_page,
        )

        formatted_markdown = format_markdown(completion.content)
        input_token_count += completion.input_tokens
        output_token_count += completion.output_tokens
        prior_page = formatted_markdown

        return formatted_markdown, input_token_count, output_token_count, prior_page, PageStatus.SUCCESS, None

    except Exception as error:
        logging.error(f"{Messages.FAILED_TO_PROCESS_IMAGE} Error:{error}")
        if error_mode == ErrorMode.THROW:
            raise
        return "", input_token_count, output_token_count, "", PageStatus.ERROR, str(error)


async def process_pages_in_batches(
    images: List[str],
    concurrency: int,
    model: litellmmodel,
    temp_directory: str = "",
    input_token_count: int = 0,
    output_token_count: int = 0,
    prior_page: str = "",
    error_mode: ErrorMode = ErrorMode.IGNORE,
):
    # Create a semaphore to limit the number of concurrent tasks
    semaphore = asyncio.Semaphore(concurrency)

    # Process each page in parallel
    tasks = [
        process_page(
            image,
            model,
            temp_directory,
            input_token_count,
            output_token_count,
            prior_page,
            semaphore,
            error_mode=error_mode,
        )
        for image in images
    ]

    # Wait for all tasks to complete
    return await asyncio.gather(*tasks)
