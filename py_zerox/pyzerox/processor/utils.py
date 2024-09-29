import os
import re
from typing import Optional, Union, Iterable
from urllib.parse import urlparse
import aiofiles
import aiohttp
from PyPDF2 import PdfReader, PdfWriter
from ..constants.messages import Messages

# Package Imports
from ..errors.exceptions import ResourceUnreachableException, PageNumberOutOfBoundError


async def download_file(
    file_path: str,
    temp_dir: str,
) -> Optional[str]:
    """Downloads a file from a URL or local path to a temporary directory."""

    local_pdf_path = os.path.join(temp_dir, os.path.basename(file_path))
    if is_valid_url(file_path):
        async with aiohttp.ClientSession() as session:
            async with session.get(file_path) as response:
                if response.status != 200:
                    raise ResourceUnreachableException()
                async with aiofiles.open(local_pdf_path, "wb") as f:
                    await f.write(await response.read())
    else:
        async with aiofiles.open(file_path, "rb") as src, aiofiles.open(
            local_pdf_path, "wb"
        ) as dst:
            await dst.write(await src.read())
    return local_pdf_path


def is_valid_url(string: str) -> bool:
    """Checks if a string is a valid URL."""

    try:
        result = urlparse(string)
        return all([result.scheme, result.netloc]) and result.scheme in [
            "http",
            "https",
        ]
    except ValueError:
        return False
    
def create_selected_pages_pdf(original_pdf_path: str, select_pages: Union[int, Iterable[int]], 
                              save_directory: str, suffix: str = "_selected_pages",
                              sorted_pages: bool = True) -> str:
    """
    Creates a new PDF with only the selected pages.
    
    :param original_pdf_path: Path to the original PDF file.
    :type original_pdf_path: str
    :param select_pages: A single page number or an iterable of page numbers (1-indexed).
    :type select_pages: int or Iterable[int]
    :param save_directory: The directory to store the new PDF.
    :type save_directory: str
    :param suffix: The suffix to add to the new PDF file name, defaults to "_selected_pages".
    :type suffix: str, optional
    :param sorted_pages: Whether to sort the selected pages, defaults to True.
    :type sorted_pages: bool, optional
    :return: Path the new PDF file
    """

    file_name = os.path.splitext(os.path.basename(original_pdf_path))[0]

    # Write the new PDF to a temporary file
    selected_pages_pdf_path = os.path.join(save_directory, f"{file_name}{suffix}.pdf")

    # Ensure select_pages is iterable, if not, convert to list
    if isinstance(select_pages, int):
        select_pages = [select_pages]
    
    if sorted_pages:
        # Sort the pages for consistency
        select_pages = sorted(list(select_pages))

    with open(original_pdf_path, "rb") as orig_pdf, open(selected_pages_pdf_path, "wb") as new_pdf:

        # Read the original PDF
        reader = PdfReader(stream=orig_pdf)
        total_pages = len(reader.pages)

        # Validate page numbers
        invalid_page_numbers = []
        for page in select_pages:
            if page < 1 or page > total_pages:
                invalid_page_numbers.append(page)

        ## raise error if invalid page numbers
        if invalid_page_numbers:
            raise PageNumberOutOfBoundError(extra_info={"input_pdf_num_pages":total_pages,
                                                        "select_pages": select_pages,
                                                        "invalid_page_numbers": invalid_page_numbers})

        # Create a new PDF writer
        writer = PdfWriter(fileobj=new_pdf)

        # Add only the selected pages
        for page_number in select_pages:
            writer.add_page(reader.pages[page_number - 1])

        writer.write(stream=new_pdf)

    return selected_pages_pdf_path
