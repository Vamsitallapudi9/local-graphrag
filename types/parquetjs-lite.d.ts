declare module 'parquetjs-lite' {
  export interface ParquetCursor {
    next(): Promise<unknown | undefined>
  }

  export class ParquetReader {
    static openFile(filePath: string): Promise<ParquetReader>
    getCursor(): ParquetCursor
    close(): Promise<void>
  }

  const parquetDefault: {
    ParquetReader: typeof ParquetReader
  }

  export default parquetDefault
}
