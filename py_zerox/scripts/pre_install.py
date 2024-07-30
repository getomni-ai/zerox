# pre_install.py

import subprocess
import sys
import platform


def run_command(command):
    try:
        result = subprocess.run(command, shell=True, text=True, capture_output=True)
        result.check_returncode()
        return result.stdout
    except subprocess.CalledProcessError as e:
        raise RuntimeError(e.stderr.strip())


def install_package(command, package_name):
    try:
        output = run_command(command)
        print(output)
        return output
    except RuntimeError as e:
        raise RuntimeError(f"Failed to install {package_name}: {e}")


def check_and_install():
    try:
        # Check and install Poppler
        try:
            run_command("pdftoppm -h")
        except RuntimeError:
            if platform.system() == "Darwin":  # macOS
                install_package("brew install poppler", "Poppler")
            elif platform.system() == "Linux":  # Linux
                install_package(
                    "sudo apt-get update && sudo apt-get install -y poppler-utils",
                    "Poppler",
                )
            else:
                raise RuntimeError(
                    "Please install Poppler manually from https://poppler.freedesktop.org/"
                )

    except RuntimeError as err:
        print(f"Error during installation: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    check_and_install()
