import aiofiles
import base64
import io


async def encode_image_to_base64(image_path: str) -> str:
    """Encode an image to base64 asynchronously."""
    async with aiofiles.open(image_path, "rb") as image_file:
        image_data = await image_file.read()
    return base64.b64encode(image_data).decode("utf-8")


async def save_image(image, image_path: str):
    """Save an image to a file asynchronously."""
    # Convert PIL Image to BytesIO object
    with io.BytesIO() as buffer:
        image.save(buffer, format=image.format)  # Save the image to the BytesIO object
        image_data = buffer.getvalue()  # Get the image data from the BytesIO object

    # Write image data to file asynchronously
    async with aiofiles.open(image_path, "wb") as f:
        await f.write(image_data)
