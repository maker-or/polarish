import { useEffect, useState } from "react";

type ViewState = {
  filePath: string;
  storedAuth: Record<string, unknown> | null;
};

type ProviderId = "chatgpt" | "copilot" | "gemini";

type Provider = {
  id: ProviderId;
  title: string;
  subtitle: string;
};

const providers: Provider[] = [
  {
    id: "chatgpt",
    title: "ChatGPT",
    subtitle: "connect your ChatGPT account",
  },
  {
    id: "copilot",
    title: "Copilot",
    subtitle: "connect your Copilot account",
  },
  {
    id: "gemini",
    title: "Gemini",
    subtitle: "connect your Gemini account",
  },
];

function ChatGPTMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      preserveAspectRatio="xMidYMid"
      viewBox="0 0 256 260"
    >
      <path
        fill="currentColor"
        d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"
      />
    </svg>
  );
}

function ProviderIcon({
  id,
  className = "",
}: { id: ProviderId; className?: string }) {
  if (id === "chatgpt") {
    return <ChatGPTMark className={className} />;
  }

  if (id === "copilot") {
    return (
      <svg
        aria-hidden="true"
        className={className}
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="7" r="2.5" />
        <circle cx="7" cy="10" r="2" />
        <circle cx="17" cy="10" r="2" />
        <path d="M12 11c-2.5 0-4.5 1.5-5 3.5h10c-.5-2-2.5-3.5-5-3.5z" />
        <path d="M7 14c-1.8 0-3.2 1-3.7 2.5h7.4C10.2 15 8.8 14 7 14z" opacity="0.6" />
        <path
          d="M17 14c-1.8 0-3.2 1-3.7 2.5h7.4C20.2 15 18.8 14 17 14z"
          opacity="0.6"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 2 L13.2 10.8 L22 12 L13.2 13.2 L12 22 L10.8 13.2 L2 12 L10.8 10.8 Z" />
    </svg>
  );
}

function App() {
  const [isChatGPTLoading, setIsChatGPTLoading] = useState(false);
  const [isChatGPTConnected, setIsChatGPTConnected] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("chatgpt");
  const [viewState, setViewState] = useState<ViewState>({
    filePath: "",
    storedAuth: null,
  });

  useEffect(() => {
    void window.electronAPI.getHaxAuth().then((result) => {
      setViewState({
        filePath: result.filePath,
        storedAuth: result.storedAuth,
      });
    });
  }, []);

  const handleChatGPTSignIn = async () => {
    setIsChatGPTLoading(true);

    try {
      const result = await window.electronAPI.signInWithChatGPT();
      if (result.ok) {
        setIsChatGPTConnected(true);
      }
    } finally {
      setIsChatGPTLoading(false);
    }
  };

  const activeProvider =
    providers.find((provider) => provider.id === selectedProvider) ?? providers[0];

  return (
    <main className="min-h-screen w-full bg-[#0f0f0f] text-white font-sans overflow-hidden flex">
      {/* Sidebar */}
      <div className="fixed left-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 p-2.5 rounded-[2rem] bg-white/[0.03] border border-white/[0.05] backdrop-blur-md">
        {providers.map((provider) => {
          const isActive = provider.id === selectedProvider;
          return (
            <button
              key={provider.id}
              onClick={() => setSelectedProvider(provider.id)}
              className={`p-3 rounded-full transition-all duration-200 flex items-center justify-center ${
                isActive
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
              }`}
            >
              <ProviderIcon id={provider.id} className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="flex-1 ml-32 p-16">
        <div className="flex items-start justify-between max-w-5xl">
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-white/90">
              {activeProvider.title}
            </h1>
            <p className="mt-2 text-[15px] text-white/40">
              {activeProvider.subtitle}
            </p>
          </div>

          <button
            onClick={activeProvider.id === "chatgpt" ? handleChatGPTSignIn : undefined}
            disabled={activeProvider.id === "chatgpt" && (isChatGPTLoading || isChatGPTConnected)}
            className="px-6 py-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[14px] font-medium text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {activeProvider.id === "chatgpt" && isChatGPTConnected
              ? "Connected"
              : activeProvider.id === "chatgpt" && isChatGPTLoading
                ? "Connecting..."
                : "Connect"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default App;
