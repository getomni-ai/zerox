import aiofiles
import base64


async def encode_image_to_base64(image_path: str) -> str:
    async with aiofiles.open(image_path, "rb") as image_file:
        image_data = await image_file.read()
    return base64.b64encode(image_data).decode("utf-8")


async def save_image(image, image_path: str):
    async with aiofiles.open(image_path, "wb") as f:
        await f.write(image.tobytes())
