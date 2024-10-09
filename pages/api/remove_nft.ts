import { supabase } from '@/lib/supabase';
import { NextApiRequest, NextApiResponse } from 'next';
import { Account, constants, ec, RpcProvider, typedData, Contract, uint256, encode } from 'starknet';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { method, url } = req;

  switch (method) {
    case "POST":
      try {
        const { nft_contract_address: nftContractAddress, token_id } = req.body;

        if (!nftContractAddress || !token_id) {
          res.status(400).json({ ok: false, error: 'Missing nftContractAddress or token_id' });
        }
        const provider = new RpcProvider({ nodeUrl: process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_RPC });
        const { abi } = await provider.getClassAt(nftContractAddress);
        if (!abi) {
          // throw new Error('ABI not found for the contract');
          res.status(404).json({ ok: false, error: 'ABI not found for the nft contract' });
        }
        const contract = new Contract(abi, nftContractAddress, provider);
        const ownerOfNFT = await contract.ownerOf(token_id);
        console.log(ownerOfNFT);
        if (ownerOfNFT !== process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_WRAPPER_ADDRESS) {
          res.status(403).json({ ok: false, error: 'The NFT is already unwrapped.' });
          return;
        }
        else {
          const lengthOnChain = await contract.balanceOf(process.env.NEXT_PUBLIC_STARKNET_SEPOLIA_WRAPPER_ADDRESS);
          const { data: nfts, error } = await supabase
          .from('nft_pool')
          .select('token_ids')
          .eq('nft_contract_address', BigInt(nftContractAddress));
          if (error) {
            res.status(500).json({ ok: false, error: error.message });
          }
          const lengthInDB = nfts?.[0].token_ids?.length || 0;
          if (lengthInDB !== lengthOnChain + 1) {
            res.status(403).json({ ok: false, error: 'There are some error in the database.' });
          }
          // Remove the token_id from the nfts array
          const updatedTokenIds = nfts?.[0].token_ids?.filter(id => id !== token_id) || [];

          // Update the database with the new array
          const { data: updateResult, error: updateError } = await supabase
            .from('nft_pool')
            .update({ token_ids: updatedTokenIds })
            .eq('nft_contract_address', BigInt(nftContractAddress));

          if (updateError) {
            res.status(500).json({ ok: false, error: updateError.message });
            return;
          }

          if (!updateResult) {
            res.status(500).json({ ok: false, error: 'Failed to update the database' });
            return;
        }
        }
        
        res.status(200).json({ ok: true, message: `Token ID #${token_id} removed successfully` });

      } catch (error: unknown) {
        if (error instanceof Error) {
          res.status(500).json({ ok: false, error: error.message });
        } else {
          res.status(500).json({ ok: false, error: 'An unknown error occurred' });
        }
      }
      break;

    default:
      res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
};

export default handler;