import {Composition} from "remotion";
import {BridgeDemo} from "./BridgeDemo";

export const Root = () => {
  return (
    <Composition
      id="BridgeDemo"
      component={BridgeDemo}
      durationInFrames={48 * 24}
      fps={24}
      width={1920}
      height={1080}
    />
  );
};
