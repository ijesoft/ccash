import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, Observable } from "@apollo/client";

const httpLink = new HttpLink({
  uri: "/api/graphql",
});

const authLink = new ApolloLink((operation, forward) => {
  const token = localStorage.getItem("accessToken");
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
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: "network-only" },
  },
});

export default client;