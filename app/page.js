// File: app/page.js (The Home Page)

export default function HomePage() {
  return (
    // This is the responsive container for the home page
    <main className="min-h-screen p-6 pb-[env(safe-area-inset-bottom)] lg:max-w-4xl lg:mx-auto">
      
      <h1 className="glow-text text-3xl font-bold mb-6">Bulldog PRA Autopilot</h1>

      <div className="card-enhanced">
        <p className="text-lg font-semibold mb-3">Select a Matter</p>

        <a
          href="/matters/yakima"
          className="block p-4 border border-[#334155] rounded-lg hover:border-cyan-400 transition-colors"
        >
          <p className="font-bold">Yakima PRA Litigation</p>
          <p className="text-sm text-gray-400">Brandon Kapp — 25-2-12345-6 SEA</p>
        </a>
      </div>
    </main>
  );
}
