const { exec } = require("child_process");
const { promisify } = require("util");

const execPromise = promisify(exec);

const installPackage = async (command, packageName) => {
  try {
    const { stdout, stderr } = await execPromise(command);
    if (stderr) {
      throw new Error(`Failed to install ${packageName}: ${stderr}`);
    }
    return stdout;
  } catch (error) {
    throw new Error(`Failed to install ${packageName}: ${error.message}`);
  }
};

const checkAndInstall = async () => {
  try {
    // Check and install Ghostscript
    try {
      await execPromise("gs --version");
    } catch {
      if (process.platform === "darwin") {
        await installPackage("brew install ghostscript", "Ghostscript");
      } else if (process.platform === "linux") {
        await installPackage(
          "sudo apt-get update && sudo apt-get install -y ghostscript",
          "Ghostscript"
        );
      } else {
        throw new Error(
          "Please install Ghostscript manually from https://www.ghostscript.com/download.html"
        );
      }
    }

    // Check and install GraphicsMagick
    try {
      await execPromise("gm -version");
    } catch {
      if (process.platform === "darwin") {
        await installPackage("brew install graphicsmagick", "GraphicsMagick");
      } else if (process.platform === "linux") {
        await installPackage(
          "sudo apt-get update && sudo apt-get install -y graphicsmagick",
          "GraphicsMagick"
        );
      } else {
        throw new Error(
          "Please install GraphicsMagick manually from http://www.graphicsmagick.org/download.html"
        );
      }
    }
  } catch (err) {
    console.error(`Error during installation: ${err.message}`);
    process.exit(1);
  }
};

checkAndInstall();
