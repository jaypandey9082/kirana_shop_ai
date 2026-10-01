declare module "paytmchecksum" {
  const PaytmChecksum: {
    generateSignature(params: Record<string, string> | string, key: string): Promise<string>;
    verifySignature(params: Record<string, string> | string, key: string, checksum: string): boolean;
  };
  export default PaytmChecksum;
}
