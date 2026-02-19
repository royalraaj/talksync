// Resume & document parser — extracts text from PDF and DOCX files

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Use locally bundled worker (CDN fetch doesn't work in Tauri's webview)
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Extract text from a PDF file
 */
export async function extractPdfText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
            .map((item: any) => item.str)
            .join(' ');
        pages.push(text);
    }

    return pages.join('\n\n');
}

/**
 * Extract text from a DOCX file using mammoth
 */
export async function extractDocxText(file: File): Promise<string> {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

/**
 * Auto-detect file type and extract text
 */
export async function extractText(file: File): Promise<string> {
    const name = file.name.toLowerCase();

    if (name.endsWith('.pdf')) {
        return extractPdfText(file);
    } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
        return extractDocxText(file);
    } else if (name.endsWith('.txt') || name.endsWith('.md')) {
        return file.text();
    }

    throw new Error(`Unsupported file type: ${name}. Please use PDF, DOCX, or TXT.`);
}
