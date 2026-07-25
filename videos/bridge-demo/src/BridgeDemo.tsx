import type {CSSProperties, ReactNode} from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const FPS = 24;
const BLUE = "#3f8cff";
const RED = "#ff626e";
const GREEN = "#54d68a";
const TEXT = "#f4f7fb";
const MUTED = "#9aa8bb";
const PANEL = "#0d131d";
const BORDER = "#273449";

const seconds = (value: number) => value * FPS;

const enter = (frame: number, distance = 32) => ({
  opacity: interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  transform: `translateY(${interpolate(frame, [0, 14], [distance, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })}px)`,
});

const shell: CSSProperties = {
  border: `1px solid ${BORDER}`,
  background: PANEL,
  boxShadow: "0 36px 90px rgba(0,0,0,0.48)",
  overflow: "hidden",
};

const Label = ({children, color = BLUE}: {children: ReactNode; color?: string}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      color,
      fontSize: 18,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: 0,
    }}
  >
    <span style={{width: 10, height: 10, background: color}} />
    {children}
  </div>
);

const Brand = () => (
  <div
    style={{
      position: "absolute",
      top: 42,
      right: 56,
      display: "flex",
      alignItems: "center",
      gap: 15,
      color: TEXT,
      fontSize: 25,
      fontWeight: 800,
      zIndex: 20,
    }}
  >
    <span style={{color: BLUE, fontFamily: "monospace"}}>[--]</span>
    bridge
  </div>
);

const Base = ({children}: {children: ReactNode}) => (
  <AbsoluteFill
    style={{
      background: "#06090f",
      color: TEXT,
      fontFamily:
        'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.18,
        backgroundImage:
          "linear-gradient(#263246 1px, transparent 1px), linear-gradient(90deg, #263246 1px, transparent 1px)",
        backgroundSize: "72px 72px",
      }}
    />
    {children}
    <Brand />
  </AbsoluteFill>
);

const Shot = ({
  children,
  duration,
  last = false,
}: {
  children: ReactNode;
  duration: number;
  last?: boolean;
}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = last
    ? interpolate(frame, [duration - 18, duration], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;
  return <AbsoluteFill style={{opacity: Math.min(fadeIn, fadeOut)}}>{children}</AbsoluteFill>;
};

const Browser = ({
  src,
  style,
  imageStyle,
}: {
  src: string;
  style?: CSSProperties;
  imageStyle?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, seconds(12)], [1.005, 1.035], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        ...shell,
        position: "absolute",
        borderRadius: 12,
        ...style,
      }}
    >
      <div
        style={{
          height: 46,
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 9,
          background: "#0a0f17",
        }}
      >
        {[RED, "#f4bf52", GREEN].map((color) => (
          <span key={color} style={{width: 11, height: 11, borderRadius: 20, background: color}} />
        ))}
        <div
          style={{
            marginLeft: 18,
            height: 20,
            width: 470,
            background: "#151d29",
            borderRadius: 3,
          }}
        />
      </div>
      <div style={{position: "absolute", inset: "46px 0 0", overflow: "hidden"}}>
        <Img
          src={staticFile(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${drift})`,
            ...imageStyle,
          }}
        />
      </div>
    </div>
  );
};

const Title = ({
  kicker,
  title,
  body,
  frame,
}: {
  kicker: string;
  title: string;
  body?: string;
  frame: number;
}) => (
  <div style={{...enter(frame), position: "absolute", left: 86, top: 92, zIndex: 10}}>
    <Label>{kicker}</Label>
    <div style={{fontSize: 68, lineHeight: 1.02, fontWeight: 850, marginTop: 22, maxWidth: 1040}}>
      {title}
    </div>
    {body ? (
      <div style={{fontSize: 26, lineHeight: 1.42, color: MUTED, marginTop: 20, maxWidth: 940}}>
        {body}
      </div>
    ) : null}
  </div>
);

const ContractScene = () => {
  const frame = useCurrentFrame();
  return (
    <Base>
      <Img
        src={staticFile("assets/change.png")}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.2,
          filter: "brightness(0.55)",
          transform: `scale(${interpolate(frame, [0, seconds(5)], [1.03, 1.08])})`,
        }}
      />
      <Title
        kicker="Breaking contract"
        title="One API field changes."
        body="Customer integrations can stop compiling."
        frame={frame}
      />
      <div
        style={{
          ...shell,
          ...enter(frame - 5, 44),
          position: "absolute",
          left: 86,
          right: 86,
          bottom: 90,
          height: 300,
          borderRadius: 10,
          display: "grid",
          gridTemplateColumns: "1fr 120px 1fr",
          alignItems: "center",
          padding: "0 58px",
        }}
      >
        <Field state="V1 - REMOVED" name="payment_method" color={RED} />
        <div style={{textAlign: "center", color: BLUE, fontSize: 42, fontWeight: 900}}>-&gt;</div>
        <Field state="V2 - REQUIRED" name="payment_method_id" color={GREEN} />
      </div>
    </Base>
  );
};

const Field = ({state, name, color}: {state: string; name: string; color: string}) => (
  <div style={{borderLeft: `5px solid ${color}`, padding: "24px 30px", background: "#090e16"}}>
    <div style={{color, fontSize: 17, fontWeight: 800}}>{state}</div>
    <div style={{fontFamily: "monospace", fontSize: 36, marginTop: 28}}>{name}</div>
  </div>
);

const ScopeScene = () => {
  const frame = useCurrentFrame();
  const files = [
    "src/checkout/create-payment.ts",
    "src/subscriptions/renew.ts",
    "src/refunds/retry-charge.ts",
  ];
  return (
    <Base>
      <Title
        kicker="Guarded TypeScript scope"
        title="Three request objects."
        body="The recipe matches request shape, not every similar string."
        frame={frame}
      />
      <Browser
        src="assets/home.png"
        style={{left: 760, top: 160, width: 1080, height: 710}}
        imageStyle={{objectPosition: "center top"}}
      />
      <div style={{position: "absolute", left: 86, top: 470, width: 610, display: "grid", gap: 16}}>
        {files.map((file, index) => (
          <div
            key={file}
            style={{
              ...shell,
              ...enter(frame - 5 - index * 4, 25),
              borderRadius: 6,
              padding: "22px 24px",
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontSize: 20,
            }}
          >
            <span style={{color: GREEN, fontFamily: "monospace"}}>0{index + 1}</span>
            <code>{file}</code>
          </div>
        ))}
        <div style={{color: MUTED, fontSize: 19, marginTop: 8}}>
          Comments, docs, log strings: outside patch eligibility.
        </div>
      </div>
    </Base>
  );
};

const PatchScene = () => {
  const frame = useCurrentFrame();
  return (
    <Base>
      <Title
        kicker="Deterministic AST patch"
        title="Only the proven key changes."
        body="No model writes customer code on this path."
        frame={frame}
      />
      <div
        style={{
          ...shell,
          ...enter(frame - 4, 38),
          position: "absolute",
          left: 86,
          right: 86,
          bottom: 110,
          height: 430,
          borderRadius: 10,
          display: "grid",
          gridTemplateColumns: "1.25fr 0.75fr",
        }}
      >
        <div style={{padding: 52, fontFamily: "monospace", fontSize: 28, lineHeight: 1.8}}>
          <div style={{color: MUTED}}>await atlasPay.payments.create({"{"}</div>
          <div style={{color: MUTED, paddingLeft: 40}}>amount: total,</div>
          <div style={{color: RED, paddingLeft: 40}}>- payment_method: pmToken,</div>
          <div style={{color: GREEN, paddingLeft: 40}}>+ payment_method_id: pmToken,</div>
          <div style={{color: MUTED}}>{"});"}</div>
        </div>
        <div
          style={{
            borderLeft: `1px solid ${BORDER}`,
            padding: 48,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 22,
          }}
        >
          <Label color={GREEN}>Recipe guard passed</Label>
          <div style={{fontSize: 31, fontWeight: 800}}>Property key + sibling amount</div>
          <div style={{fontSize: 21, color: MUTED, lineHeight: 1.5}}>
            Same matcher powers impact reporting and patch eligibility.
          </div>
        </div>
      </div>
    </Base>
  );
};

const PullRequestScene = () => {
  const frame = useCurrentFrame();
  return (
    <Base>
      <Title
        kicker="Real GitHub handoff"
        title="Draft PR. Three lines."
        body="Human review required. Bridge never auto-merges."
        frame={frame}
      />
      <Browser
        src="assets/pr-files.png"
        style={{left: 190, right: 190, top: 350, height: 650}}
        imageStyle={{objectPosition: "center top"}}
      />
      <div
        style={{
          ...enter(frame - 8),
          position: "absolute",
          right: 120,
          top: 155,
          display: "flex",
          gap: 14,
        }}
      >
        <Chip text="DRAFT" color={BLUE} />
        <Chip text="3 FILES" color={GREEN} />
        <Chip text="+3 / -3" color={GREEN} />
      </div>
    </Base>
  );
};

const Chip = ({text, color}: {text: string; color: string}) => (
  <div
    style={{
      border: `1px solid ${color}`,
      color,
      background: "#0b111a",
      padding: "12px 18px",
      borderRadius: 4,
      fontSize: 18,
      fontWeight: 850,
    }}
  >
    {text}
  </div>
);

const EvidenceScene = () => {
  const frame = useCurrentFrame();
  return (
    <Base>
      <Title
        kicker="The evidence decides"
        title="Red base. Green exact head."
        body="Bridge SHA = PR SHA = check SHA."
        frame={frame}
      />
      <Browser
        src="assets/red-base.png"
        style={{left: 76, top: 365, width: 835, height: 560}}
        imageStyle={{objectPosition: "center top"}}
      />
      <Browser
        src="assets/green-head.png"
        style={{right: 76, top: 365, width: 835, height: 560}}
        imageStyle={{objectPosition: "center top"}}
      />
      <div style={{position: "absolute", left: 94, top: 318}}>
        <Chip text="BASE - FAILED" color={RED} />
      </div>
      <div style={{position: "absolute", right: 94, top: 318}}>
        <Chip text="PR HEAD - PASSED" color={GREEN} />
      </div>
      <div
        style={{
          ...enter(frame - 8, 0),
          position: "absolute",
          left: 805,
          top: 675,
          width: 310,
          padding: "22px 18px",
          background: "#070b12",
          border: `1px solid ${BLUE}`,
          textAlign: "center",
          fontFamily: "monospace",
          fontSize: 20,
          color: BLUE,
          zIndex: 10,
        }}
      >
        52ee5c54... matched
      </div>
    </Base>
  );
};

const RoomScene = () => {
  const frame = useCurrentFrame();
  return (
    <Base>
      <Title
        kicker="Shared migration room"
        title="Code, CI, and approval together."
        body="Provider and customer review one persisted evidence chain."
        frame={frame}
      />
      <Browser
        src="assets/room-review.png"
        style={{left: 150, right: 150, top: 350, height: 660}}
        imageStyle={{objectPosition: "center top"}}
      />
      <div
        style={{
          ...enter(frame - 6),
          position: "absolute",
          right: 110,
          top: 155,
          display: "flex",
          gap: 14,
        }}
      >
        <Chip text="RUN-SCOPED" color={BLUE} />
        <Chip text="HUMAN APPROVAL" color={GREEN} />
      </div>
    </Base>
  );
};

const EndScene = () => {
  const frame = useCurrentFrame();
  return (
    <Base>
      <div
        style={{
          ...enter(frame, 34),
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <div style={{fontFamily: "monospace", color: BLUE, fontSize: 56}}>[--]</div>
        <div style={{fontSize: 116, fontWeight: 900, marginTop: 18}}>Bridge</div>
        <div style={{fontSize: 37, color: MUTED, marginTop: 24}}>
          Breaking contract -&gt; verified migration PR
        </div>
        <div style={{display: "flex", gap: 16, marginTop: 54}}>
          <Chip text="CONTROLLED RECIPE" color={BLUE} />
          <Chip text="DRAFT PR" color={GREEN} />
          <Chip text="HUMAN DECISION" color={GREEN} />
        </div>
      </div>
    </Base>
  );
};

export const BridgeDemo = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const progress = interpolate(frame, [0, durationInFrames - 1], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scenes = [
    {from: 0, duration: seconds(5.5), node: <ContractScene />},
    {from: seconds(5), duration: seconds(7.5), node: <ScopeScene />},
    {from: seconds(12), duration: seconds(6.5), node: <PatchScene />},
    {from: seconds(18), duration: seconds(7.5), node: <PullRequestScene />},
    {from: seconds(25), duration: seconds(11.5), node: <EvidenceScene />},
    {from: seconds(36), duration: seconds(8.5), node: <RoomScene />},
    {from: seconds(44), duration: seconds(4), node: <EndScene />, last: true},
  ];

  return (
    <AbsoluteFill style={{background: "#06090f"}}>
      {scenes.map((scene, index) => (
        <Sequence key={index} from={scene.from} durationInFrames={scene.duration}>
          <Shot duration={scene.duration} last={scene.last}>
            {scene.node}
          </Shot>
        </Sequence>
      ))}
      <div
        style={{
          position: "absolute",
          zIndex: 100,
          left: 0,
          bottom: 0,
          height: 7,
          width: `${progress}%`,
          background: BLUE,
        }}
      />
    </AbsoluteFill>
  );
};
