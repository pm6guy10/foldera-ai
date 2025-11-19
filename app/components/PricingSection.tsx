export function PricingSection() {
  return (
    <section className="py-32 px-6">
      <div className="max-w-3xl mx-auto bg-slate-900/60 p-12 rounded-2xl border border-white/10 shadow-xl text-center">
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
          $47/month for a zero-miss safety brief. Forever.
        </h2>
        <p className="text-slate-300 text-lg mb-6">
          First 100 users lock in this price. Regular price: $97/mo.
        </p>
        <div className="bg-black border border-white/10 rounded-xl p-8 text-left">
          <ul className="space-y-3 text-slate-400 text-lg mb-8">
            <li>✓ Unlimited meeting briefs</li>
            <li>✓ Email + Calendar + Slack integration</li>
            <li>✓ 30-minute advance prep notifications</li>
            <li>✓ Mobile &amp; email alerts</li>
            <li>✓ AI-powered context analysis</li>
          </ul>
          <button className="w-full bg-cyan-500 hover:bg-cyan-400 text-black py-5 rounded-xl text-lg font-semibold">
            Lock in $47/mo forever
          </button>
          <p className="text-sm text-slate-400 text-center mt-4">
            100% money-back guarantee. Your pricing never increases.
          </p>
        </div>
      </div>
    </section>
  );
}
