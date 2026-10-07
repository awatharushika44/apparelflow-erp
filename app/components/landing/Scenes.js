export default function Scenes({ index }) {
  return (
    <div className="ld-scenes" aria-hidden="true">
      <div
        className="ld-scene ld-scene-1"
        data-active={index === 0}
      />

      <div
        className="ld-scene ld-scene-2"
        data-active={index === 1}
      >
        <svg
          className="ld-svg"
          viewBox="0 0 1200 800"
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
        >
          <path
            className="ld-curve"
            d="M110 720C130 430 300 270 520 225C650 200 720 265 700 350"
          />

          <path
            className="ld-stitchline"
            d="M140 720C160 450 318 296 530 252C646 230 696 284 680 352"
          />

          <path
            className="ld-curve"
            d="M1090 110C1010 300 880 345 760 330C690 322 650 380 690 450"
          />

          <path
            className="ld-stitchline"
            d="M1060 140C990 310 884 366 770 356C720 350 688 392 716 446"
          />

          <path
            className="ld-curve"
            d="M300 760C420 640 560 600 700 640C820 672 930 650 1010 560"
          />

          <circle
            className="ld-curve"
            cx="520"
            cy="225"
            r="9"
          />

          <circle
            className="ld-curve"
            cx="760"
            cy="330"
            r="9"
          />

          <path
            className="ld-crop"
            d="M40 90V40H90M1110 40H1160V90M40 710V760H90M1110 760H1160V710"
          />
        </svg>
      </div>

      <div
        className="ld-scene ld-scene-3"
        data-active={index === 2}
      />
    </div>
  );
}