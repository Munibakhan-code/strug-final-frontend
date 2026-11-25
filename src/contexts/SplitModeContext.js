import { createContext, useContext } from "react";

export const SplitModeContext = createContext(false);

export function useSplitMode() {
	return useContext(SplitModeContext);
}
