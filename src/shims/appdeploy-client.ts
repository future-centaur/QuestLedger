/** Build stub so Vite can compile when the platform SDK is not installed. */
export const auth = {
  getUser: async () => null,
  signIn: async () => {
    throw new Error('Platform auth is not available in this build.');
  },
  signOut: async () => {},
};

export const api = {
  get: async () => {
    throw new Error('Platform API is not available in this build.');
  },
  post: async () => {
    throw new Error('Platform API is not available in this build.');
  },
};
