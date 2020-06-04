import { Module } from "vuex";
import { IRootState } from "@/store/types";
import { IPlatformState } from './IPlatformState';
import { platform } from "@/ava";
import Big from "big.js";
import Subnet from '@/js/Subnet';
import { ISubnetData } from './ISubnet';
import { IBlockchainData } from './IBlockchain';
import Vue from 'vue';

export const AVA_SUBNET_ID = "11111111111111111111111111111111LpoYY";

const platform_module: Module<IPlatformState, IRootState> = {
    namespaced: true,
    state: {
        subnets: {}
    },
    mutations: {
        setSubnet(state, s) {
            Vue.set(state.subnets, s.id, s);
        }
    },
    actions: {
        init({ dispatch }) {
            dispatch("getSubnets");
        },
        async getSubnets({ state, commit }) {
            // Get subnets and init classes
            let subnets = (await platform.getSubnets() as ISubnetData[])
                .map((s: ISubnetData) => new Subnet(s));

            // Add Default Subnet manually for now (https://github.com/ava-labs/gecko/issues/200)
            subnets.push(new Subnet({
                id: AVA_SUBNET_ID,
                controlKeys: [],
                threshold: "1"
            }));

            // Get and set validators for each subnet
            subnets.forEach(s => {
                s.updateValidators();
                s.updatePendingValidators();
                commit("setSubnet", s);
            });

            // Get blockchains
            let blockchains = await platform.getBlockchains() as IBlockchainData[];

            // Add P-Chain manually
            blockchains.push({
                name: "P-Chain",
                id: "11111111111111111111111111111111LpoYY",
                subnetID: "11111111111111111111111111111111LpoYY",
                vmID: "???"
            });

            // Map blockchains to their subnet
            blockchains.forEach(b => {
                let subnetID = b.subnetID;
                state.subnets[subnetID].addBlockchain(b);
            });
        }
    },
    getters: {
        totalValidators(state) {
            // Count of active validators in default subnet
            let defaultSubnet = state.subnets[AVA_SUBNET_ID];
            return (!defaultSubnet) ?
                0 : defaultSubnet.validators.length;
        },
        totalPendingValidators(state) {
            // Count of active validators in default subnet
            let defaultSubnet = state.subnets[AVA_SUBNET_ID];
            return (!defaultSubnet) ?
                0 : defaultSubnet.pendingValidators.length;
        },
        totalStake(state) {
            // returns Big Number. Total $AVA active stake on default subnet
            let defaultSubnet = state.subnets[AVA_SUBNET_ID];
            let total = Big(0);
            return (!defaultSubnet) ? total :
                total = defaultSubnet.validators.reduce((a, v) => a.add(Big(v.stakeAmount as number)), total);
        },
        totalPendingStake(state) {
            // returns Big Number. Total $AVA pending stake on default subnet
            let defaultSubnet = state.subnets[AVA_SUBNET_ID];
            let total = Big(0);
            return (!defaultSubnet) ? total :
                total = defaultSubnet.pendingValidators.reduce((a, v) => a.add(Big(v.stakeAmount as number)), total);
        },
        cumulativeStake(state) {
            // returns Big Number[]. Accumulative distribution of active stakes
            let defaultSubnet = state.subnets[AVA_SUBNET_ID];
            let res: Big[] = [];
            let total = Big(0)
            if (defaultSubnet) {
                defaultSubnet.validators.forEach(v => {
                    total = total.add(Big(v.stakeAmount as number));
                    res.push(total)
                });
            }
            return res;
        },
        cumulativePendingStake(state) {
            // returns Big Number[]. Accumulative distribution of pending stakes
            let defaultSubnet = state.subnets[AVA_SUBNET_ID];
            let res: Big[] = [];
            let total = Big(0);
            if (defaultSubnet) {
                defaultSubnet.pendingValidators.forEach(v => {
                    total = total.add(Big(v.stakeAmount as number));
                    res.push(total)
                });
            }
            return res;
        },
        totalBlockchains(state) {
            let total = 0;
            for (const subnetID of Object.keys(state.subnets)) {
                total += state.subnets[subnetID].blockchains.length;
            }
            return total;
        }
    }
};

export default platform_module;
