import React from "react";
import CreatorProductStudio from "./CreatorProductStudio";
import ProductBuilderV4 from "./ProductBuilderV4";

export default function ProductBuilder(props) {
  if (props.mode === "creator") {
    return <CreatorProductStudio {...props} />;
  }
  return <ProductBuilderV4 {...props} />;
}
