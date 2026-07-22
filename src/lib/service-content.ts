export type ServiceEditorial = {
  summary: string;
  intro: string;
  supportIncludes: string[];
  howItWorks: string;
  outcomes: string;
  audience: string;
  referralRoutes: string;
  eligibility: string;
  supportModel: string;
};

const serviceEditorial: Record<string, ServiceEditorial> = {
  'supported-accommodation': {
    summary: 'A safe, settled home with practical support around you.',
    intro: 'Supported accommodation gives you a stable place to live while you work towards the goals that matter to you. The home is part of the support, but it is not the whole story: we also help with routines, tenancy skills, wellbeing, and the next move.',
    supportIncludes: ['A clear welcome and settling-in plan', 'Practical help with bills, budgeting, appointments, and household routines', 'Regular key-work conversations shaped around your goals', 'Tenancy sustainment and preparation for move-on when the time is right'],
    howItWorks: 'We start by understanding what would make home feel safe and workable. Your support plan is reviewed with you, so the level of help can change as your confidence and independence grow.',
    outcomes: 'People may use this service to build daily routines, maintain a tenancy, reconnect with services, or prepare for a home with less support.',
    audience: 'Adults who need a safe, stable home and practical support while building or rebuilding independence.',
    referralRoutes: 'Referrals can come from local authorities, housing teams, health and care partners, voluntary organisations, or from you directly.',
    eligibility: 'We will talk with you about safety, housing need, support needs, accessibility, and availability before making an offer.',
    supportModel: 'Person-led support with a named worker, agreed goals, planned reviews, and clear boundaries around privacy and safeguarding.'
  },
  'homelessness-support': {
    summary: 'A route from housing crisis to a home that lasts.',
    intro: 'Homelessness support combines a safe place to stay with practical help to move beyond crisis. We focus on what is urgent now, while making space for the longer-term work that helps a tenancy last.',
    supportIncludes: ['A housing and safety conversation at the start of the service', 'Help with identification, benefits, housing applications, and appointments', 'Support to build routines, manage a home, and maintain relationships with services', 'Move-on planning with realistic next steps and continued signposting'],
    howItWorks: 'We agree the immediate priorities first. As things settle, your plan can include housing options, health and wellbeing, money, work or learning, and the practical steps needed for move-on.',
    outcomes: 'The aim is a safer housing situation, stronger tenancy skills, better connection to services, and a realistic route into a home that can be sustained.',
    audience: 'Adults who are homeless, at risk of losing their home, or moving on from temporary accommodation.',
    referralRoutes: 'Referrals are welcome from housing options teams, outreach services, probation, health partners, voluntary organisations, and people contacting us directly.',
    eligibility: 'We consider current housing circumstances, support needs, safety, local connection where relevant, and available capacity.',
    supportModel: 'Practical, strengths-based support with regular check-ins, coordinated referrals, and a plan that keeps the next housing step visible.'
  },
  'care-leavers': {
    summary: 'A steady start for young adults making their own way.',
    intro: 'Moving into adulthood can feel like a lot to hold at once. Our support for care leavers and young people combines a stable home with patient help to build the skills, confidence, and relationships that make independence feel possible.',
    supportIncludes: ['Support with cooking, cleaning, money, appointments, and household routines', 'Help to understand a tenancy and communicate with landlords or services', 'Planning around education, training, employment, and positive use of time', 'A consistent adult relationship, clear boundaries, and space to make choices safely'],
    howItWorks: 'We agree a plan with you and the professionals involved in your transition, while keeping your voice at the centre. Support is stepped up or down as your confidence changes.',
    outcomes: 'The service can help young people sustain a home, develop life skills, stay connected to education or work, and move towards greater independence.',
    audience: 'Young people aged 18–25, including care leavers, who need a safe home and support to make their next steps.',
    referralRoutes: 'Referrals can come from leaving-care teams, social care, housing services, education or health partners, or from a young person directly.',
    eligibility: 'We will discuss age, care or housing history, support needs, safety, accessibility, and whether the setting is a good fit.',
    supportModel: 'Consistent, respectful support that builds skills without taking over, with clear plans and regular reviews.'
  },
  'domestic-abuse': {
    summary: 'Confidential refuge and support, without judgement.',
    intro: 'Our domestic-abuse service is built around safety, choice, and confidentiality. We provide a calm place to think, practical help for the next step, and support for women and families rebuilding after abuse.',
    supportIncludes: ['Safety planning and support to understand available options', 'Advocacy with housing, benefits, legal, health, and children’s services', 'Emotional and practical support at a pace that feels manageable', 'Help with move-on planning, school or nursery arrangements, and rebuilding routines'],
    howItWorks: 'We begin with what is safest to share and agree how we should communicate. Exact refuge addresses are never published. Details are shared only with people who need them for a safe referral or support plan.',
    outcomes: 'People may use the service to create immediate safety, make informed choices, stabilise family life, and plan a future home without abuse.',
    audience: 'Women and families who need safe accommodation and support because of domestic abuse.',
    referralRoutes: 'Referrals can come from domestic-abuse services, local authorities, health or social care partners, police, voluntary organisations, or from you directly when it is safe.',
    eligibility: 'We assess immediate safety, housing need, family circumstances, accessibility, and available space. We will never ask you to share more than is needed at the first stage.',
    supportModel: 'Trauma-informed, confidential support with safeguarding oversight, choice about communication, and a clear plan for immediate and longer-term safety.'
  },
  'mental-health': {
    summary: 'A calm base for recovery and everyday wellbeing.',
    intro: 'Mental-health support provides a steady home and practical help while someone moves towards greater independence. We work alongside existing health and care relationships; we do not replace clinical treatment or emergency services.',
    supportIncludes: ['Support to build routines around sleep, food, appointments, and self-care', 'Help to understand a tenancy and keep a home manageable', 'Planning for early signs of distress and the right people to contact', 'Support to reconnect with community, learning, work, or other meaningful activity'],
    howItWorks: 'We agree a plan around the person’s strengths, communication preferences, risks, and goals. Reviews help us notice what is working and adjust support before small difficulties become bigger ones.',
    outcomes: 'The service can support a safer routine, stronger self-management, improved connection with care, and a planned move towards less supported living.',
    audience: 'Adults who need a supported step between hospital, temporary accommodation, or higher support and a more independent home.',
    referralRoutes: 'Referrals can come from mental-health teams, hospitals, social care, housing services, voluntary organisations, or from someone seeking support with a professional’s involvement.',
    eligibility: 'We discuss current support, risk, accommodation needs, accessibility, and whether the service can work alongside existing care arrangements.',
    supportModel: 'Calm, structured support with agreed contact, collaborative risk planning, and regular reviews with the person and relevant partners.'
  },
  'refugee-move-on': {
    summary: 'A welcoming home while a new chapter takes shape.',
    intro: 'Refugee move-on support helps people and families turn temporary security into a stable home. We focus on the practical tasks of settling, while recognising the importance of belonging, language, community, and choice.',
    supportIncludes: ['Help to understand a tenancy, bills, local services, and household routines', 'Support with benefits, documents, appointments, and housing communication', 'Connections to language learning, community activities, health, and advice services', 'Planning for a sustainable home and the support that will be useful after move-on'],
    howItWorks: 'We listen to what the person or family already knows and can do, then build a practical plan around the gaps. Support is reviewed as the household becomes more settled and connected.',
    outcomes: 'The aim is a stable tenancy, stronger local connections, confidence using services, and a home where the next chapter can take shape.',
    audience: 'Newly granted refugees and families who are ready for move-on accommodation and practical settlement support.',
    referralRoutes: 'Referrals can come from asylum or refugee support organisations, local authorities, housing teams, community groups, or from families and professionals contacting us directly.',
    eligibility: 'We discuss immigration and housing circumstances, household needs, safety, accessibility, and whether the available home is suitable.',
    supportModel: 'Welcoming, culturally aware support that works with interpreters or communication aids when needed and keeps the household’s goals central.'
  }
};

export function getServiceEditorial(slug: string): ServiceEditorial | undefined {
  return serviceEditorial[slug];
}

