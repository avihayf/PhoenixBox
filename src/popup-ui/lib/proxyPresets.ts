export interface ProxyPreset {
  id: string;
  name: string;
  scheme: string;
  host: string;
  port: number;
  autoEnablePaintBurp?: boolean;
}

export const DEFAULT_PROXY_PRESETS: ProxyPreset[] = [
  {
    id: 'burp-suite',
    name: 'Burp Suite',
    scheme: 'http',
    host: '127.0.0.1',
    port: 8080,
  },
];
