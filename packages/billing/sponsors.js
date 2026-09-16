// GitHub Sponsors client. Uses a token of the sponsorable account (or an
// org owner) so that private sponsorships are visible too.

const QUERY = (ownerField) => `
query($login: String!, $after: String) {
  owner: ${ownerField}(login: $login) {
    sponsorshipsAsMaintainer(first: 100, after: $after, includePrivate: true, activeOnly: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        isOneTimePayment
        tier { monthlyPriceInCents isOneTime }
        sponsorEntity {
          __typename
          ... on User { login databaseId }
          ... on Organization { login databaseId }
        }
      }
    }
  }
}`;

export async function fetchActiveSponsors({ token, login, type = 'user', fetch = globalThis.fetch }) {
  if (!token || !login) throw new Error('GitHub Sponsors sync requires GITHUB_SPONSORS_TOKEN and membership.sponsorable.login');
  const query = QUERY(type === 'organization' ? 'organization' : 'user');
  const sponsors = [];
  let after = null;
  do {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'tokenpot' },
      body: JSON.stringify({ query, variables: { login, after } }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.errors?.length || !body.data?.owner) {
      throw new Error(`GitHub Sponsors query failed: ${body.errors?.[0]?.message ?? res.status}`);
    }
    const page = body.data.owner.sponsorshipsAsMaintainer;
    for (const node of page.nodes) {
      if (!node?.sponsorEntity) continue;
      sponsors.push({
        githubId: node.sponsorEntity.databaseId,
        login: node.sponsorEntity.login,
        monthlyCents: node.tier?.monthlyPriceInCents ?? 0,
        oneTime: Boolean(node.isOneTimePayment || node.tier?.isOneTime),
      });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return sponsors;
}
