from logging import log
import os
import asyncio
from typing import List, Optional, Tuple
from pdf2image import convert_from_path
from src.constants.conversion import PDFConversionDefaultOptions
from src.constants.messages import Messages
from src.models.openai import OpenAI
from src.processor.image import save_image
from src.processor.text import format_markdown


async def convert_pdf_to_images(local_path: str, temp_dir: str):
    options = {
        "dpi": PDFConversionDefaultOptions.DPI,
        "fmt": PDFConversionDefaultOptions.FORMAT,
        "size": PDFConversionDefaultOptions.SIZE,
        "thread_count": PDFConversionDefaultOptions.THREAD_COUNT,
        "use_pdftocairo": PDFConversionDefaultOptions.USE_PDFTOCAIRO,
    }
    file_name = os.path.splitext(os.path.basename(local_path))[0]

    try:
        images = convert_from_path(local_path, **options)
        tasks = []
        for i, image in enumerate(images, start=1):
            image_path = os.path.join(temp_dir, f"{file_name}_page_{i}.png")
            tasks.append(save_image(image, image_path))
        await asyncio.gather(*tasks)
        return images
    except Exception as err:
        log.error(f"Error converting PDF to images: {err}")


async def process_page(
    image: str,
    model: OpenAI,
    temp_directory: str = "",
    input_token_count: int = 0,
    output_token_count: int = 0,
    prior_page: str = "",
    semaphore: Optional[asyncio.Semaphore] = None,
) -> Tuple[str, int, int, str]:

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
        log.error(Messages.FAILED_TO_PROCESS_IMAGE, error)
        return "", input_token_count, output_token_count, ""


async def process_pages_in_batches(
    images: List[str],
    concurrency: int,
    model: OpenAI,
    temp_directory: str = "",
    input_token_count: int = 0,
    output_token_count: int = 0,
    prior_page: str = "",
):
    semaphore = asyncio.Semaphore(concurrency)
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
    return await asyncio.gather(*tasks)
