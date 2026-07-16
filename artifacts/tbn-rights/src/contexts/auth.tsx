import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetMe, User, setAuthTokenGetter, useLogin, useLogout, getGetMeQueryKey, LoginInput } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (data: LoginInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("auth_token"));
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("auth_token"));
  }, []);

  const { data: user, isLoading: isUserLoading } = useGetMe({
    query: {
      enabled: !!token,
      queryKey: getGetMeQueryKey(),
      retry: false,
    }
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const login = async (data: LoginInput) => {
    const response = await loginMutation.mutateAsync({ data });
    localStorage.setItem("auth_token", response.token);
    setToken(response.token);
    setLocation("/");
  };

  const logout = async () => {
    try {
      if (token) {
        await logoutMutation.mutateAsync();
      }
    } catch (e) {
      // Ignore errors on logout
    } finally {
      localStorage.removeItem("auth_token");
      setToken(null);
      queryClient.clear();
      setLocation("/login");
    }
  };

  useEffect(() => {
    if (!token && !isUserLoading) {
      setLocation("/login");
    }
  }, [token, isUserLoading, setLocation]);

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading: isUserLoading || loginMutation.isPending, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
