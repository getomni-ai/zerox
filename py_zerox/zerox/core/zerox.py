import os
import shutil
import tempfile
from typing import List, Optional
from datetime import datetime
import aiofiles
import aiofiles.os as async_os

# Package Imports
from ..processor import (
    convert_pdf_to_images,
    download_file,
    process_page,
    process_pages_in_batches,
)
from ..errors import MissingOpenAIAPIKeyException, FileUnavailable
from ..models import OpenAI
from .types import Page, ZeroxOutput


async def zerox(
    cleanup: bool = True,
    concurrency: int = 10,
    file_path: Optional[str] = "",
    maintain_format: bool = False,
    openai_api_key: Optional[str] = None,
    output_dir: Optional[str] = None,
    temp_dir: str = tempfile.gettempdir(),
) -> ZeroxOutput:
    input_token_count = 0
    output_token_count = 0
    prior_page = ""
    aggregated_markdown: List[str] = []
    start_time = datetime.now()

    # OpenAI Key Validators
    if not openai_api_key and not os.getenv("OPENAI_API_KEY", None):
        raise MissingOpenAIAPIKeyException()

    # File Path Validators
    if not file_path:
        raise FileUnavailable()

    # Ensure the output directory exists
    if output_dir:
        await async_os.makedirs(output_dir, exist_ok=True)

    # Create a temporary directory to store the PDF and images
    temp_directory = os.path.join(temp_dir or tempfile.gettempdir(), "zerox-temp")
    await async_os.makedirs(temp_directory, exist_ok=True)

    # Download the PDF. Get file name.
    local_path = await download_file(file_path=file_path, temp_dir=temp_directory)
    if not local_path:
        raise FileUnavailable()

    raw_file_name = os.path.splitext(os.path.basename(local_path))[0]
    file_name = "".join(c.lower() if c.isalnum() else "_" for c in raw_file_name)

    # Convert the file to a series of images
    await convert_pdf_to_images(local_path=local_path, temp_dir=temp_directory)

    # Get list of converted images
    images = [
        f"{temp_directory}/{f}"
        for f in await async_os.listdir(temp_directory)
        if f.endswith(".png")
    ]

    # Create an instance of the OpenAI model
    openai = OpenAI(api_key=openai_api_key)

    if maintain_format:
        for image in images:
            result, input_token_count, output_token_count, prior_page = await process_page(
                image,
                openai,
                temp_directory,
                input_token_count,
                output_token_count,
                prior_page,
            )
            if result:
                aggregated_markdown.append(result)
    else:
        results = await process_pages_in_batches(
            images,
            concurrency,
            openai,
            temp_directory,
            input_token_count,
            output_token_count,
            prior_page,
        )

        aggregated_markdown = [result[0] for result in results if isinstance(result[0], str)]

    # Write the aggregated markdown to a file
    if output_dir:
        result_file_path = os.path.join(output_dir, f"{file_name}.md")
        async with aiofiles.open(result_file_path, "w") as f:
            await f.write("\n\n".join(aggregated_markdown))

    # Cleanup the downloaded PDF file
    if cleanup and os.path.exists(temp_directory):
        shutil.rmtree(temp_directory)

    # Format JSON response
    end_time = datetime.now()
    completion_time = (end_time - start_time).total_seconds() * 1000
    formatted_pages = [
        Page(content=content, page=i + 1, content_length=len(content))
        for i, content in enumerate(aggregated_markdown)
    ]

    return ZeroxOutput(
        completion_time=completion_time,
        file_name=file_name,
        input_tokens=input_token_count,
        output_tokens=output_token_count,
        pages=formatted_pages,
    )
