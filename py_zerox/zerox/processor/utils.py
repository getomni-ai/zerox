import os
from typing import Optional
from urllib.parse import urlparse
import aiofiles
import aiohttp

# Package Imports
from ..errors.exceptions import ResourceUnreachableException


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
