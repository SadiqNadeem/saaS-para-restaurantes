import {Composition} from "remotion";
import type {FC} from "react";
import {KebabPromo} from "./KebabPromo";

export const Root: FC = () => {
  return (
    <Composition
      id="KebabPromo"
      component={KebabPromo}
      durationInFrames={1800}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
