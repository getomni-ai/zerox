import * as Tesseract from "tesseract.js";

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
