import * as Tesseract from "tesseract.js";

import { NUM_STARTING_WORKERS } from "../constants";

export const getTesseractScheduler = async () => {
  return Tesseract.createScheduler();
};

const createAndAddWorker = async (scheduler: Tesseract.Scheduler) => {
  const worker = await Tesseract.createWorker("eng", 2, {
    legacyCore: true,
    legacyLang: true,
  });

  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.OSD_ONLY,
  });

  return scheduler.addWorker(worker);
};

export const addWorkersToTesseractScheduler = async ({
  numWorkers,
  scheduler,
}: {
  numWorkers: number;
  scheduler: Tesseract.Scheduler;
}) => {
  let resArr = Array.from({ length: numWorkers });

  await Promise.all(resArr.map(() => createAndAddWorker(scheduler)));

  return true;
};

export const terminateScheduler = (scheduler: Tesseract.Scheduler) => {
  return scheduler.terminate();
};

export const prepareWorkersForImageProcessing = async ({
  numImages,
  maxTesseractWorkers,
  scheduler,
}: {
  numImages: number;
  maxTesseractWorkers: number;
  scheduler: Tesseract.Scheduler | null;
}) => {
  // Add more workers if correctOrientation is true
  const numRequiredWorkers = numImages;
  let numNewWorkers = numRequiredWorkers - NUM_STARTING_WORKERS;

  if (maxTesseractWorkers !== -1) {
    const numPreviouslyInitiatedWorkers =
      maxTesseractWorkers < NUM_STARTING_WORKERS
        ? maxTesseractWorkers
        : NUM_STARTING_WORKERS;

    if (numRequiredWorkers > numPreviouslyInitiatedWorkers) {
      numNewWorkers = Math.min(
        numRequiredWorkers - numPreviouslyInitiatedWorkers,
        maxTesseractWorkers - numPreviouslyInitiatedWorkers
      );
    } else {
      numNewWorkers = 0;
    }
  }

  // Add more workers if needed
  if (numNewWorkers > 0 && maxTesseractWorkers !== 0 && scheduler)
    addWorkersToTesseractScheduler({
      numWorkers: numNewWorkers,
      scheduler,
    });
};
