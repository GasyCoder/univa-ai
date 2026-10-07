import type { ComponentProps } from 'react';

export function assistantUrl(params?: { role?: number; prompt?: string }) {
  const query = new URLSearchParams();
  if (params?.role !== undefined) query.set('role', String(params.role));
  if (params?.prompt) query.set('prompt', params.prompt);
  return '/assistant' + (query.size ? '?' + query.toString() : '');
}

export function AssistantLink({ children, href = '/assistant', ...props }: ComponentProps<'a'>) {
  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open the assistant in a new window"
      aria-description="Opens in a new window or tab"
    >
      {children}
    </a>
  );
}
