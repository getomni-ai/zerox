from setuptools import setup, find_packages
from setuptools.command.install import install
import subprocess
import sys


class InstallSystemDependencies(install):
    def run(self):
        try:
            subprocess.check_call([sys.executable, "-m", "py_zerox.scripts.pre_install"])
        except subprocess.CalledProcessError as e:
            print(f"Pre-install script failed: {e}", file=sys.stderr)
            sys.exit(1)
        install.run(self)


setup(
    name="py-zerox",
    cmdclass={
        "install": InstallSystemDependencies,
    },
    version="0.0.5",
    packages=find_packages(where="py_zerox"),  # Specify the root folder
    package_dir={"": "py_zerox"},  # Map root directory
    include_package_data=True,
)
