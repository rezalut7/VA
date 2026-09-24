import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./cards.css";
import "./card-art.css";
import "./brand.css";
import "./consent.css";
import "./referral.css";
import "./story-share.css";
import "./resilience.css";

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state={failed:false}; }
  static getDerivedStateFromError() { return {failed:true}; }
  componentDidCatch(error) { console.error("Mini App render failed",error); }
  render() {
    if(this.state.failed) return <main className="splash fatal-recovery"><div className="recovery-sigil">✦</div><h1>Вернём магию</h1><p>Telegram прервал загрузку интерфейса. Ваши данные сохранены.</p><button className="primary" onClick={()=>window.location.reload()}>Загрузить ещё раз</button></main>;
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>
);
