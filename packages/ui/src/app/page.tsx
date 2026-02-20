import { ChatPanel } from "@/components/ChatPanel";

export default function Home() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      <header
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <h1 style={{ fontSize: "18px", fontWeight: 600 }}>Mecha UI</h1>
      </header>
      <ChatPanel />
    </main>
  );
}
