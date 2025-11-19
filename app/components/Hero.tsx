export function Hero() {
  return (
    <section className="pt-40 pb-32 px-6 text-center">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-6xl md:text-7xl font-bold text-white mb-8 leading-tight">
          Never walk into a meeting unprepared
        </h1>
        <p className="text-xl md:text-2xl text-gray-300 leading-relaxed mb-10 max-w-2xl mx-auto">
          AI reads your email and Slack overnight. Sends a 2-minute safety brief 30 minutes before every meeting so you never miss a promise or walk in blind.
        </p>
        <button className="bg-cyan-500 hover:bg-cyan-400 text-black px-10 py-5 rounded-xl text-lg font-semibold">
          Get your first brief free
        </button>
        <p className="text-gray-400 text-lg mt-6">
          Foldera protects you from missed commitments, contradictory emails, and forgotten promises — automatically.
        </p>
      </div>
    </section>
  );
}
