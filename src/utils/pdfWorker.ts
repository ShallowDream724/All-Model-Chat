import type { pdfjs } from 'react-pdf';

const PDF_WORKER_SRC = '/pdf.worker.min.mjs?v=amc-pdf-worker-20260429';

export const configurePdfWorker = (targetPdfjs: Pick<typeof pdfjs, 'GlobalWorkerOptions'>) => {
  targetPdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
};
