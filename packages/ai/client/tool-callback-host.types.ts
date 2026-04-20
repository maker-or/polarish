export type ToolCallbackHost = {
	toolExecution: {
		callbackUrl: string;
		bearerToken: string;
	};
	dispose: () => void;
};
