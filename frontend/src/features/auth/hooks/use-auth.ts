"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getCurrentUser } from "@/application/use-cases/get-current-user";
import { login } from "@/application/use-cases/login";
import { logout } from "@/application/use-cases/logout";
import type { Credentials } from "@/domain/entities/auth-session";
import { useServices } from "@/infrastructure/composition/services-context";
import { queryKeys } from "@/infrastructure/query/query-keys";

export function useCurrentUser() {
  const { auth, tokens } = useServices();

  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: ({ signal }) => getCurrentUser(auth, signal),
    enabled: Boolean(tokens.getAccessToken()),
  });
}

export function useLogin() {
  const { auth, tokens } = useServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: Credentials) => login(auth, tokens, credentials),
    onSuccess(session) {
      queryClient.setQueryData(queryKeys.auth.me, session.user);
    },
  });
}

export function useLogout() {
  const { auth, tokens } = useServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => logout(auth, tokens),
    onSettled() {
      queryClient.removeQueries({ queryKey: queryKeys.auth.me });
    },
  });
}
