declare module "bcryptjs" {
  const bcrypt: {
    compare(data: string, encrypted: string): Promise<boolean>;
    hash(data: string, saltOrRounds: number): Promise<string>;
  };
  export default bcrypt;
}
