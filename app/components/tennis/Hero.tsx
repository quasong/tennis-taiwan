export function Hero() {
  return (
    <section className="overview">
      <div className="intro">
        <p className="eyebrow">Taiwan tennis finder</p>
        <h1>今天想打球，就從一場剛好的約球開始。</h1>
        <p className="lead">
          依城市、程度、時間快速找到球友。登入後即可建立自己的球局，讓臨時手癢變成穩定上場。
        </p>
        <div className="quick-stats" aria-label="平台摘要">
          <span>
            <strong>18</strong>
            <small>開放球局</small>
          </span>
          <span>
            <strong>6</strong>
            <small>熱門球場</small>
          </span>
          <span>
            <strong>3.5</strong>
            <small>平均 NTRP</small>
          </span>
        </div>
      </div>

      <div className="court-visual" aria-label="網球場視覺">
        <div className="court-frame">
          <div className="court-line court-line-vertical" />
          <div className="court-line court-line-horizontal" />
          <div className="court-service court-service-left" />
          <div className="court-service court-service-right" />
          <span className="player-dot player-one" />
          <span className="player-dot player-two" />
          <span className="ball-dot" />
        </div>
      </div>
    </section>
  );
}
