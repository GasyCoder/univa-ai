export const faqs = [
  {
    question: 'Who is UNUVIA for?',
    answer:
      'UNUVIA is an AI workspace for universities, bringing students, faculty, researchers, and university staff together in one platform. You can register with any email address.',
  },
  {
    question: 'What can I use today?',
    answer:
      'You can create an account, organize conversations on your device, attach text documents, and choose a model. Assistant responses require a connected model service; the workspace clearly tells you when that service is unavailable.',
  },
  {
    question: 'What does the Free plan include?',
    answer:
      'Free includes your personal workspace, local conversation history, text attachments, and the model picker. No credit card is required. Model access depends on the connected service and is not guaranteed by creating an account.',
  },
  {
    question: 'Can I subscribe to Pro now?',
    answer:
      'Pro is planned at $12 per month in USD. Join the waitlist to register your interest. There is no checkout, charge, or paid subscription yet.',
  },
  {
    question: 'Where are my conversations stored?',
    answer:
      'Conversation history is saved in this browser, separately for each account. It does not sync across devices. When you send a request, your message and attached text are shared with the connected model service.',
  },
  {
    question: 'Can my team use UNUVIA?',
    answer:
      'Contact us to discuss your team’s needs and a custom proposal. Shared workspaces, organization administration, and integrations are planned features, rather than features of the current Free workspace.',
  },
];
export const useCases = [
  {
    name: 'Learning',
    icon: 'school',
    role: 0,
    title: 'Understand it. Then make it yours.',
    description:
      'Break down a complex idea, turn notes into a study guide, or test what you know. Keep your curiosity moving.',
    prompt:
      'Explain the greenhouse effect with a simple example, then ask me three practice questions.',
    points: [
      'Explain unfamiliar concepts',
      'Structure your study notes',
      'Practice with useful questions',
    ],
  },
  {
    name: 'Teaching',
    icon: 'book',
    role: 1,
    title: 'A better starting point for your next lesson.',
    description:
      'Get a first outline, shape an activity, and make room for your own expertise. You stay in charge of the final lesson.',
    prompt:
      'Help me outline a 45-minute lesson on critical thinking with learning objectives and a group activity.',
    points: ['Build lesson outlines', 'Explore classroom activities', 'Draft practice questions'],
  },
  {
    name: 'Research',
    icon: 'flask',
    role: 2,
    title: 'Bring structure to open questions.',
    description:
      'Explore a research direction and work through your documents. Keep the reasoning clear and verify the sources.',
    prompt:
      'Help me structure a literature review on urban biodiversity. Identify research questions and gaps to investigate.',
    points: [
      'Frame research questions',
      'Compare your text documents',
      'Organize an initial outline',
    ],
  },
  {
    name: 'Writing',
    icon: 'file',
    role: 3,
    title: 'From a rough thought to a useful draft.',
    description:
      'Turn scattered notes into a brief, summary, or report. Refine the language until it sounds like you.',
    prompt: 'Help me turn these notes into a clear project brief: ',
    points: ['Draft reports and briefs', 'Summarize source material', 'Refine tone and structure'],
  },
];
