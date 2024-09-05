class Messages:
    """User-facing messages"""

    MISSING_ENVIRONMENT_VARIABLES = """
    Required environment variable (keys) from the model are Missing. Please set the required environment variables for the model provider.
    Refer: https://docs.litellm.ai/docs/providers
    """
    
    NON_VISION_MODEL = """
    The provided model is not a vision model. Please provide a vision model.
    """

    MODEL_ACCESS_ISSUE = """
    Your provided model can't be accessed. Please make sure you have access to the model and also required environment variables are setup correctly including valid api key(s).
    Refer: https://docs.litellm.ai/docs/providers
    """

    NON_200_RESPONSE = """
    Model API returned status code {status_code}: {data}

    Please check the litellm documentation for more information. https://docs.litellm.ai/docs/exception_mapping.
    """

    COMPLETION_ERROR = """
    Error in Completion Response. Error: {0}
    Please check the status of your model provider API status.
    """

    PDF_CONVERSION_FAILED = """
    Error during PDF conversion: {0}
    Please check the PDF file and try again. For more information: https://github.com/Belval/pdf2image
    """

    FILE_UNREACHAGBLE = """
    File not found or unreachable. Status Code: {0}
    """

    FILE_PATH_MISSING = """
    File path is invalid or missing.
    """

    FAILED_TO_SAVE_FILE = """Failed to save file to local drive"""

    FAILED_TO_PROCESS_IMAGE = """Failed to process image"""
