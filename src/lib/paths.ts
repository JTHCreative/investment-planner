/** Where a portfolio's page lives: your own at /p/{id}, someone else's (shared with you) at /s/{owner}/{id}. */
export const portfolioPath = (p: { id: string; ownerId: string }, me: string) => (p.ownerId === me ? `/p/${p.id}` : `/s/${p.ownerId}/${p.id}`);
