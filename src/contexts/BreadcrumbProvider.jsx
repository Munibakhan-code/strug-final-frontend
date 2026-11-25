import { useState } from "react";
import { BreadcrumbContext } from "./BreadcrumbContext.js";

export function BreadcrumbProvider({ children }) {
  const [subTrail, setSubTrail] = useState([]);
  return (
    <BreadcrumbContext.Provider value={{ subTrail, setSubTrail }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}
