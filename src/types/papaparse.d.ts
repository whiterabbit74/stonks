declare module 'papaparse' {
	// Minimal types we actually use
	export interface ParseError {
		message: string;
		code?: string;
		row?: number;
	}
	export interface ParseMeta {}
	export interface ParseResult<T> {
		data: T[];
		errors: ParseError[];
		meta: ParseMeta;
	}
	export type ParseErrorFn = (error: ParseError) => void;
	export interface ParseConfig {
		header?: boolean;
		skipEmptyLines?: boolean | 'greedy';
		complete?: (results: ParseResult<Record<string, unknown>>) => void;
		error?: ParseErrorFn;
	}
	const Papa: {
		parse(file: File | string, config?: ParseConfig): void;
	};
	export default Papa;
}