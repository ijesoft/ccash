import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from "@apollo/client";
import { onError } from "@apollo/client/link/error";

const httpLink = new HttpLink({
  uri: "/api/graphql",
});

type BackgroundRefreshHandler = () => void;

let backgroundRefreshHandler: BackgroundRefreshHandler | null = null;
let lastBackgroundRefresh = 0;

export function setBackgroundRefreshHandler(fn: BackgroundRefreshHandler | null) {
  backgroundRefreshHandler = fn;
}

const sessionErrorLink = onError(({ graphQLErrors }) => {
  const messages = (graphQLErrors ?? []).map((e: { message: string }) => e.message);
  // Only the backend's idle-revocation message means "must log out". It is
  // raised by refresh/touch after 5 min of true inactivity.
  const idleRevoked = messages.some((m) => /session expired due to inactivity/i.test(m));
  if (idleRevoked && localStorage.getItem("accessToken")) {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login?reason=session-expired";
    }
    return;
  }
  // Any other auth failure (e.g. a merely expired access token) is recoverable:
  // trigger one debounced silent refresh and let the next attempt succeed.
  const authFailed = messages.some((m) => /unauthenticated|not authenticated/i.test(m));
  if (authFailed && backgroundRefreshHandler) {
    const now = Date.now();
    if (now - lastBackgroundRefresh > 30000) {
      lastBackgroundRefresh = now;
      backgroundRefreshHandler();
    }
  }
});

const getAccessToken = () => localStorage.getItem("accessToken");

const authLink = new ApolloLink((operation, forward) => {
  const token = getAccessToken();
  if (token) {
    operation.setContext(({ headers = {} }: { headers?: Record<string, string> }) => ({
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
      },
    }));
  }
  return forward(operation);
});

const client = new ApolloClient({
  link: sessionErrorLink.concat(authLink.concat(httpLink)),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: "cache-and-network", errorPolicy: "all" },
    query: { fetchPolicy: "network-only", errorPolicy: "all" },
  },
});

export default client;
