declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string
    numpages?: number
    numrender?: number
    info?: unknown
    metadata?: unknown
    version?: string
  }

  function pdfParse(buffer: Buffer, options?: unknown): Promise<PdfParseResult>
  export default pdfParse
}

