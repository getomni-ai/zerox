import logging
import os
import asyncio
from typing import List, Optional, Tuple

# Package Imports
from .image import save_image
from .text import format_markdown
from ..constants import PDFConversionDefaultOptions, Messages
from ..models import litellmmodel


async def convert_pdf_to_images(local_path: str, temp_dir: str) -> List[str]:
    """Converts a PDF file to a series of images in the temp_dir. Returns a list of image paths in page order."""
    try:
        logging.info("Attempting to use pdf2image library...")

        # import and try to use pdf2image library
        from pdf2image import convert_from_path

        options = {
            "pdf_path": local_path,
            "output_folder": temp_dir,
            "dpi": PDFConversionDefaultOptions.DPI,
            "fmt": PDFConversionDefaultOptions.FORMAT,
            "size": PDFConversionDefaultOptions.SIZE,
            "thread_count": PDFConversionDefaultOptions.THREAD_COUNT,
            "use_pdftocairo": PDFConversionDefaultOptions.USE_PDFTOCAIRO,
            "paths_only": True,
        }
        image_paths = await asyncio.to_thread(
            convert_from_path, **options
        )
        return image_paths
    
    except Exception as err:
        logging.warning(f"Poppler conversion failed, falling back to PyMuPDF: {err}")
        
        # import PyMuPDF library and the Image library
        import fitz
        import io
        from PIL import Image

        try:
            # Fallback to PyMuPDF
            image_paths = []
            doc = fitz.open(local_path)
            
            for page_num in range(len(doc)):
                page = doc[page_num]
                # Convert to image with specified DPI
                pix = page.get_pixmap(dpi=PDFConversionDefaultOptions.DPI)
                
                # Convert to PIL Image for potential resizing
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))
                
                # Resize if needed based on image_height parameter
                if PDFConversionDefaultOptions.SIZE[1]:
                    aspect_ratio = img.width / img.height
                    new_height = min(PDFConversionDefaultOptions.SIZE[1], img.height)
                    if PDFConversionDefaultOptions.SIZE[0]:
                        new_height = max(PDFConversionDefaultOptions.SIZE[0], new_height)
                    new_width = int(new_height * aspect_ratio)
                    img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                
                # Save the image
                output_path = f"{temp_dir}/page_{page_num + 1}.png"
                img.save(output_path)
                image_paths.append(output_path)
            
            return image_paths

        except Exception as err:
            logging.error(f"Both Poppler and PyMuPDF conversion failed: {err}")
            raise


async def process_page(
    image: str,
    model: litellmmodel,
    temp_directory: str = "",
    input_token_count: int = 0,
    output_token_count: int = 0,
    prior_page: str = "",
    semaphore: Optional[asyncio.Semaphore] = None,
) -> Tuple[str, int, int, str]:
    """Process a single page of a PDF"""

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

        return formatted_markdown, input_token_count, output_token_count, prior_page

    except Exception as error:
        logging.error(f"{Messages.FAILED_TO_PROCESS_IMAGE} Error:{error}")
        return "", input_token_count, output_token_count, ""


async def process_pages_in_batches(
    images: List[str],
    concurrency: int,
    model: litellmmodel,
    temp_directory: str = "",
    input_token_count: int = 0,
    output_token_count: int = 0,
    prior_page: str = "",
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
        )
        for image in images
    ]

    # Wait for all tasks to complete
    return await asyncio.gather(*tasks)
