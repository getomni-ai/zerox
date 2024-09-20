from typing import Dict
from PIL import Image
import pytesseract

from py_zerox.pyzerox.constants.messages import Messages


def enhance_image_for_ocr(image: Image) -> Image:
    """
    Enhances the given image for Optical Character Recognition.
    Converts the image to grayscale.

    Args:
        image (Image): The input image to be enhanced.

    Returns:
        Image: The enhanced grayscale image ready for OCR processing.
    """
    image = image.convert("L")
    return image


async def _clean_ocr_text(data: Dict[str, list]) -> Dict[str, list]:
    """
    Processes the input data dictionary containing OCR results,
    filtering out entries with low confidence scores or empty text.

    Args:
        data (dict): A dictionary containing OCR results:
            - 'text': A list of recognized text strings.
            - 'conf': A list of confidence scores corresponding to each text.
            - 'left': A list of x-coordinates for the text bounding boxes.
            - 'top': A list of y-coordinates for the text bounding boxes.
            - 'width': A list of widths for the text bounding boxes.
            - 'height': A list of heights for the text bounding boxes.

    Returns:
        dict: A dictionary containing filtered lists of text and attributes:
            - 'text_list': A list of valid text strings.
            - 'left_list': A list of x-coordinates for the text bounding boxes.
            - 'top_list': A list of y-coordinates for the text bounding boxes.
            - 'width_list': A list of widths for the text bounding boxes.
            - 'height_list': A list of heights for the text bounding boxes.
    """
    data_lists = {
        "text_list": [],
        "left_list": [],
        "top_list": [],
        "width_list": [],
        "height_list": [],
    }

    for i in range(len(data["text"])):
        if int(data["conf"][i]) > 0 and data["text"][i].strip():
            data_lists["text_list"].append(data["text"][i])
            data_lists["left_list"].append(data["left"][i])
            data_lists["top_list"].append(data["top"][i])
            data_lists["width_list"].append(data["width"][i])
            data_lists["height_list"].append(data["height"][i])

    return data_lists

