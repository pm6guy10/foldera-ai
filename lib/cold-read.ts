// ---------------------------------------------------------------------------
// Shared cold read engine — used by landing page hero and /try
// ---------------------------------------------------------------------------

export interface VisitorContext {
  timeOfDay: 'late_night' | 'early_morning' | 'morning' | 'afternoon' | 'evening';
  dayOfWeek: string;
  isWeekend: boolean;
  hour: number;
  scenario: string | null;
  referrer: string | null;
  device: 'mobile' | 'desktop';
}

export interface ColdRead {
  observation: string;
  subtext: string;
  confidence: number;
}

export function getVisitorContext(searchParams?: string): VisitorContext {
  const now = new Date();
  const hour = now.getHours();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = now.getDay();

  let timeOfDay: VisitorContext['timeOfDay'] = 'morning';
  if (hour >= 22 || hour < 5) timeOfDay = 'late_night';
  else if (hour >= 5 && hour < 7) timeOfDay = 'early_morning';
  else if (hour >= 7 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else timeOfDay = 'evening';

  const params = new URLSearchParams(searchParams || window.location.search);
  const scenario = params.get('s') || params.get('scenario');
  const ref = params.get('ref') || null;

  let referrer: string | null = null;
  try {
    const docRef = document.referrer;
    if (docRef) {
      if (docRef.includes('reddit.com')) referrer = 'reddit';
      else if (docRef.includes('twitter.com') || docRef.includes('x.com')) referrer = 'twitter';
      else if (docRef.includes('linkedin.com')) referrer = 'linkedin';
      else if (docRef.includes('news.ycombinator.com')) referrer = 'hackernews';
      else if (!docRef.includes('foldera.ai') && !docRef.includes('localhost')) referrer = 'external';
    }
  } catch { /* cross-origin */ }

  const device = window.innerWidth < 768 ? 'mobile' : 'desktop';

  return {
    timeOfDay,
    dayOfWeek: dayNames[day],
    isWeekend: day === 0 || day === 6,
    hour,
    scenario: scenario || ref,
    referrer: referrer || (ref ? ref : null),
    device,
  };
}

export function generateColdRead(ctx: VisitorContext): ColdRead {
  const displayHour = ctx.hour > 12 ? ctx.hour - 12 : ctx.hour || 12;
  const ampm = ctx.hour >= 12 ? 'pm' : 'am';

  // Scenario-specific reads
  if (ctx.scenario === 'job') {
    if (ctx.timeOfDay === 'late_night') {
      return {
        observation: `It's ${displayHour}${ampm} and you're looking at job search tools instead of sleeping.`,
        subtext: "That's not research. That's the 2am anxiety loop: refresh LinkedIn, check email, wonder if you should have worded that cover letter differently. The silence between submitting and hearing back is louder at night. You're not lazy \u2014 you're exhausted from applying into a void and getting nothing back but form rejections and silence.",
        confidence: 39,
      };
    }
    return {
      observation: `${ctx.dayOfWeek}. You clicked the job hunt scenario.`,
      subtext: "Here's what that pattern usually looks like from the outside: dozens of applications, a few callbacks that went nowhere, and a growing suspicion that the problem isn't your resume. The 'one more application' compulsion is a coping mechanism \u2014 it feels productive but it's keeping you from the harder question of whether you're targeting the right role at all. Meanwhile, the recruiter emails pile up unanswered because none of them feel quite right.",
      confidence: 41,
    };
  }

  if (ctx.scenario === 'builder' || ctx.scenario === 'founder') {
    if (ctx.timeOfDay === 'late_night') {
      return {
        observation: `Late-night ${ctx.dayOfWeek}. Building alone.`,
        subtext: "The gap between building and shipping is where solo founders go to die. You've got commits but no users. Features but no feedback. The loneliness isn't about being alone \u2014 it's about not knowing if what you're building matters to anyone besides you. 'One more feature before I launch' is the lie that feels like progress.",
        confidence: 38,
      };
    }
    return {
      observation: `You clicked the founder scenario.`,
      subtext: "Here's what I'd bet: you have a product that works, or close to it. But instead of showing it to people, you're adding features. Instead of writing the cold email, you're tweaking the landing page. Instead of asking 'will anyone use this,' you're asking 'is it good enough yet.' It's never good enough yet. That's the point. The question you're avoiding isn't about the product \u2014 it's about whether anyone will care.",
      confidence: 40,
    };
  }

  if (ctx.scenario === 'life' || ctx.scenario === 'admin') {
    if (ctx.isWeekend) {
      return {
        observation: `${ctx.dayOfWeek}. The day you were supposed to catch up.`,
        subtext: "The registration that closes Monday. The lease reply you've been drafting in your head for two weeks. The dentist appointment you've rescheduled three times. None of it is hard. That's the problem \u2014 it's too boring to prioritize and too important to ignore. So it sits in the back of your mind, taking up space, making everything else feel heavier than it should. You're not behind. You're just carrying 47 invisible tasks that nobody sees.",
        confidence: 40,
      };
    }
    return {
      observation: `You clicked the life admin scenario.`,
      subtext: "Invisible mental load. That's the phrase for it, but the phrase doesn't capture what it actually feels like: nothing is urgent, everything is overdue, and the list in your head is longer than any list you've ever written down. You're not forgetting things \u2014 you're drowning in the gap between knowing what needs to happen and having the energy to make it happen. Life is running you instead of the reverse.",
      confidence: 39,
    };
  }

  // Late night, no scenario
  if (ctx.timeOfDay === 'late_night') {
    return {
      observation: `It's ${displayHour}${ampm} on a ${ctx.dayOfWeek}. You're still up.`,
      subtext: "Something specific is keeping you awake. A decision you haven't made, a conversation you're avoiding, or a pile that got so big it crossed the line from manageable to paralyzing. People don't browse tools like this at this hour out of curiosity. They do it because the current system \u2014 whatever it is \u2014 stopped working.",
      confidence: 34,
    };
  }

  // Early morning
  if (ctx.timeOfDay === 'early_morning') {
    return {
      observation: `Early ${ctx.dayOfWeek}. You're here before most people are awake.`,
      subtext: "Early risers who look at tools like this are usually carrying more than anyone around them realizes. Not because you're disorganized \u2014 because the volume of decisions you're managing has outgrown any system you could run manually. The gap between what you're tracking in your head and what's actually getting done is probably wider than you'd like to admit.",
      confidence: 36,
    };
  }

  // Weekend, no scenario
  if (ctx.isWeekend) {
    return {
      observation: `${ctx.dayOfWeek}. You're spending part of your weekend on this.`,
      subtext: "The week didn't leave enough room. That means either your days are overloaded, or something specific has been nagging you that doesn't fit into work hours. Either way \u2014 the fact that you're here means the current approach isn't working. Not because you're bad at it. Because there's more to manage than one person can hold.",
      confidence: 34,
    };
  }

  // Referrer-based reads
  if (ctx.referrer === 'reddit') {
    return {
      observation: "You came here from Reddit.",
      subtext: "Someone's post about overwhelm, dropping balls, or needing a system resonated enough to click. That's not idle curiosity \u2014 that's recognition. Whatever they described, you saw yourself in it. The fact that you're still reading means the pain is real, not theoretical.",
      confidence: 37,
    };
  }

  if (ctx.referrer === 'twitter') {
    return {
      observation: "You came here from X.",
      subtext: "Someone said something that hit close enough to click a link. Most of the time, the tool behind the link is vaporware. You're checking whether this one is different. Short answer: it reads your actual history and does the work. No chat interface. No prompting.",
      confidence: 35,
    };
  }

  if (ctx.referrer === 'hackernews') {
    return {
      observation: "You came here from Hacker News.",
      subtext: "You're evaluating architecture, not features. The short version: Bayesian confidence scoring on your own behavioral history. Deterministic math, not LLM opinions. The engine gets smarter from your approvals and skips, not from a training run. Everything is encrypted, nothing trains a global model.",
      confidence: 41,
    };
  }

  // Default weekday
  if (ctx.timeOfDay === 'afternoon') {
    return {
      observation: `${ctx.dayOfWeek} afternoon. Middle of the workday.`,
      subtext: "People who look at new tools during work hours are usually doing it because something just failed \u2014 a ball dropped, a follow-up was missed, or the to-do list got so long it became useless. The urge to find a better system is a signal. The question is whether you'll act on it or close this tab and forget about it until the next ball drops.",
      confidence: 34,
    };
  }

  return {
    observation: `${ctx.dayOfWeek} ${ctx.timeOfDay === 'evening' ? 'evening' : 'morning'}. You found your way here.`,
    subtext: "People who find tools like Foldera aren't disorganized. They're carrying too much. The gap isn't capability \u2014 it's that there are more decisions to make than hours to make them in. You don't need another app. You need something that does the work before you wake up and lets you say yes or no.",
    confidence: 35,
  };
}

// Fallback for when cold read somehow fails
export const FALLBACK_COLD_READ: ColdRead = {
  observation: "You're here. That means something isn't working the way you want it to.",
  subtext: "Foldera figures out what. It reads your history, finds the patterns, and does the work \u2014 every morning, before you wake up. You just say yes or no.",
  confidence: 30,
};
