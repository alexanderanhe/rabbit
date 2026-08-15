import { IoChevronDown } from "react-icons/io5";
import { TIMER_STYLES, type TimerStyleId } from "../timer-styles";

export function TimerStyleSelect({ value, onChange }: { value: TimerStyleId; onChange: (value: TimerStyleId) => void }) {
  const selectedStyle = TIMER_STYLES[value];
  const styleIds = Object.keys(TIMER_STYLES) as TimerStyleId[];
  const selectNextStyle = () => {
    const currentIndex = styleIds.indexOf(value);
    onChange(styleIds[(currentIndex + 1) % styleIds.length]);
  };

  return (
    <fieldset className="timer-style-select">
      <legend>TIMER STYLE</legend>
      <button type="button" className="timer-style-visual-select" style={{ background: selectedStyle.previewBackground }} onClick={selectNextStyle} aria-label={`${selectedStyle.label}. Click to change timer style.`}>
        <img src={selectedStyle.thumbnail} alt="" />
        <span aria-hidden="true"><IoChevronDown /></span>
      </button>
    </fieldset>
  );
}
