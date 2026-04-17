import { buildKuestHmacSignature } from "../../src/signing/hmac.ts";

describe("hmac", () => {
    it("buildKuestHmacSignature", async () => {
        const signature = await buildKuestHmacSignature(
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            1000000,
            "test-sign",
            "/orders",
            '{"hash": "0x123"}',
        );
        expect(signature).not.null;
        expect(signature).not.undefined;
        expect(signature).not.empty;
        expect(signature).equal("ZwAdJKvoYRlEKDkNMwd5BuwNNtg93kNaR_oU2HrfVvc=");
    });

    it("buildKuestHmacSignature transforms base64url encoding to base64", async () => {
        const base64Signature = await buildKuestHmacSignature(
            "++/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            1000000,
            "test-sign",
            "/orders",
            '{"hash": "0x123"}',
        );
        const base64UrlSignature = await buildKuestHmacSignature(
            "--_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            1000000,
            "test-sign",
            "/orders",
            '{"hash": "0x123"}',
        );
        expect(base64UrlSignature).equal(base64Signature);
    });

    it("buildKuestHmacSignature ignores invalid symbols in base64, for backwards compatibility with Node.js Buffer.from()", async () => {
        const signature = await buildKuestHmacSignature(
            "AAAAAAAAA^^AAAAAAAA<>AAAAA||AAAAAAAAAAAAAAAAAAAAA=",
            1000000,
            "test-sign",
            "/orders",
            '{"hash": "0x123"}',
        );
        expect(signature).not.null;
        expect(signature).not.undefined;
        expect(signature).not.empty;
        expect(signature).equal("ZwAdJKvoYRlEKDkNMwd5BuwNNtg93kNaR_oU2HrfVvc=");
    });
});
