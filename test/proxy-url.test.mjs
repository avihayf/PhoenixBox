import chai from "chai";
import { parseGlobalProxyUrl, sanitizeProxyUrlForStorage } from "../src/popup-ui/lib/proxy.ts";

const { expect } = chai;

describe("proxy URL parsing (popup)", () => {
  describe("parseGlobalProxyUrl", () => {
    it("parses the common Burp form", () => {
      expect(parseGlobalProxyUrl("http://127.0.0.1:8080")).to.deep.equal({
        type: "http", host: "127.0.0.1", port: 8080,
        username: undefined, password: undefined, mozProxyEnabled: false,
      });
    });

    // URL() drops a port equal to the scheme default, which made these look
    // portless and get rejected.
    it("accepts explicit default ports", () => {
      expect(parseGlobalProxyUrl("http://proxy:80").port).to.equal(80);
      expect(parseGlobalProxyUrl("https://proxy:443").port).to.equal(443);
    });

    it("still requires a port", () => {
      expect(parseGlobalProxyUrl("http://proxy")).to.equal(null);
      expect(parseGlobalProxyUrl("http://proxy:")).to.equal(null);
    });

    it("decodes credentials so the proxy receives the real values", () => {
      const p = parseGlobalProxyUrl("http://me%40corp.com:p%40ss%2Fw@proxy:3128");
      expect(p.username).to.equal("me@corp.com");
      expect(p.password).to.equal("p@ss/w");
    });

    it("maps socks5 and socks5h onto Firefox's SOCKS5 type", () => {
      expect(parseGlobalProxyUrl("socks5://h:1080").type).to.equal("socks");
      expect(parseGlobalProxyUrl("socks5h://h:1080").type).to.equal("socks");
      expect(parseGlobalProxyUrl("socks4://h:1080").type).to.equal("socks4");
    });

    it("strips IPv6 brackets and keeps the port", () => {
      const p = parseGlobalProxyUrl("http://[::1]:8080");
      expect(p.host).to.equal("::1");
      expect(p.port).to.equal(8080);
    });

    it("rejects unknown schemes, bad ports and missing schemes", () => {
      expect(parseGlobalProxyUrl("ftp://h:21")).to.equal(null);
      expect(parseGlobalProxyUrl("http://h:0")).to.equal(null);
      expect(parseGlobalProxyUrl("http://h:70000")).to.equal(null);
      expect(parseGlobalProxyUrl("127.0.0.1:8080")).to.equal(null);
    });
  });

  describe("sanitizeProxyUrlForStorage", () => {
    it("drops the password and keeps the username", () => {
      expect(sanitizeProxyUrlForStorage("http://admin:hunter2@10.0.0.1:8080"))
        .to.equal("http://admin@10.0.0.1:8080");
    });

    // Each of these used to be written to storage verbatim, password included.
    it("never stores a password from text that does not parse", () => {
      for (const partial of [
        "http://admin:hunter2",
        "admin:hunter2@10.0.0.1:8080",
        "http://admin:hunter2@10.0.0.1:",
      ]) {
        const stored = sanitizeProxyUrlForStorage(partial);
        expect(stored, partial).to.not.include("hunter2");
      }
    });

    it("never stores a password containing a slash", () => {
      expect(sanitizeProxyUrlForStorage("http://admin:hun/ter2@10.0.0.1:8080"))
        .to.not.include("ter2");
    });

    // The username used to be re-encoded on every popup open, growing
    // me%40corp -> me%2540corp -> me%252540corp.
    it("is idempotent, so a stored value never grows", () => {
      const once = sanitizeProxyUrlForStorage("http://me%40corp.com:pw@proxy:3128");
      expect(once).to.equal("http://me%40corp.com@proxy:3128");
      expect(sanitizeProxyUrlForStorage(once)).to.equal(once);
    });

    it("keeps IPv6 hosts bracketed in the stored URL", () => {
      const once = sanitizeProxyUrlForStorage("http://[::1]:8080");
      expect(once).to.equal("http://[::1]:8080");
      expect(sanitizeProxyUrlForStorage(once)).to.equal(once);
    });

    it("stores nothing for empty input", () => {
      expect(sanitizeProxyUrlForStorage("")).to.equal("");
      expect(sanitizeProxyUrlForStorage(null)).to.equal("");
    });
  });
});
