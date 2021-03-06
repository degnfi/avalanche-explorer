import avalanche_go_api from "@/avalanche_go_api";
import { ISubnetData } from "@/store/modules/platform/ISubnet"
import Blockchain from '@/js/Blockchain';
import { IValidator, IStakingData } from "@/store/modules/platform/IValidator";
import { AVALANCHE_SUBNET_ID } from '@/store/modules/platform/platform';

export default class Subnet {
    id: string;
    controlKeys: string[];
    threshold: number;
    blockchains: Blockchain[];
    validators: IValidator[];
    pendingValidators: IValidator[];
    delegations: IValidator[];
    pendingDelegations: IValidator[];

    constructor(data: ISubnetData) {
        this.id = data.id;
        this.controlKeys = data.controlKeys;
        this.threshold = parseInt(data.threshold);
        this.blockchains = [];
        this.validators = [];
        this.pendingValidators = [];
        this.delegations = [];
        this.pendingDelegations = [];
    }

    // TODO: get address details for Platform Keys (https://docs.avax.network/v1.0/en/api/platform/#platformgetaccount)

    async updateValidators(endpoint: string) {
        // Get validators from service
        let req = {
            "jsonrpc": "2.0",
            "method": endpoint,
            "params": {
                subnetID: this.id
            },
            "id": 1
        };
        let response = await avalanche_go_api.post("", req);
        let validatorsData = response.data.result.validators as IStakingData[];
        let validators: IValidator[] = []; 
        let delegations: IValidator[] = []; 
        
        if (!validatorsData) {
            return;
        }
        
        if (validatorsData.length > 0) {
            validators = this.cast(validatorsData);
            if (this.id === AVALANCHE_SUBNET_ID) {
                validators = this.sortForDelegators(validators);
                [validators, delegations] = this.nestValidatorsAndDelegators(validators, endpoint);
            }
            validators = this.sortByStake(validators, this.id);
        }

        if (endpoint === "platform.getCurrentValidators") {
            this.validators = validators;
            this.delegations = delegations;
        } else if (endpoint === "platform.getPendingValidators") {
            this.pendingValidators = validators;
            this.pendingDelegations = delegations;
        }
    }

    addBlockchain(data: Blockchain) {
        this.blockchains.push(data);
    }

    /*
     * Convert staking data from API into validator objects
     */
    private cast(stakingData: IStakingData[]): IValidator[] {
        let validators = stakingData.map((s: IStakingData) => {
            let validator: IValidator = {
                nodeID: s.nodeID,
                startTime: new Date(parseInt(s.startTime) * 1000),
                endTime: new Date(parseInt(s.endTime) * 1000)
            }

            // set optional props for validators of default subnet
            if ({}.hasOwnProperty.call(s, "stakeAmount")) {
                validator.stakeAmount = parseInt(s.stakeAmount as string);
                validator.totalStakeAmount = validator.stakeAmount;
                validator.elapsed = this.getElapsedStakingPeriod(validator);
                validator.delegators = [];
            }

            if ({}.hasOwnProperty.call(s, "address")) {
                validator.address = s.address;
            }

            // set optional props for validators of non-default subnet
            if ({}.hasOwnProperty.call(s, "weight")) {
                validator.weight = parseInt(s.weight as string);
            }

            return validator;
        });
        return validators;
    }
    
    /** 
     *  Sort validators to find delegators 
     *  Validator                   = 'address A' stakes via 'id X' with 'earliest startTime'
     *  Delegation by Validator     = 'address A' stakes via 'id X' with 'later startTime'
     *  Delegation by Other         = 'address B' stakes via 'id X' with 'later startTime'
     */
    private sortForDelegators(validators: IValidator[]): IValidator[] {
        return validators.sort((a, b) => {
            // primary sort by id
            if (a.nodeID < b.nodeID) {
                return -1;
            } else if (a.nodeID > b.nodeID) {
                return 1;
            }
            // secondary sort by startTime
            if (a.startTime.getTime() < b.startTime.getTime()) {
                return -1;
            } else if (a.startTime.getTime() < b.startTime.getTime()) {
                return 1;
            }
            return 0
        });
    }

    /** 
     *  Create set of unique validators
     *  Delegation stakes are nested inside validators
     *  Create set of delegations
     */
    private nestValidatorsAndDelegators(sorted: IValidator[], endpoint: string): IValidator[][] {
        let validatorsMap: {[key:string]: IValidator} = {};
        let delegations: IValidator[] = [];
        for (let i = 0; i < sorted.length; i++) {
            let nodeID = sorted[i].nodeID;
            if (validatorsMap[nodeID]) {
                // nest delegator within validator
                // eslint-disable-next-line
                validatorsMap[nodeID].delegators!.push(sorted[i]);
                delegations.push(sorted[i]);
            } else {
                // add validator
                validatorsMap[nodeID] = sorted[i];
            }
        }
        let nestedValidators: IValidator[] = Object.values(validatorsMap);
        
        // calculate totalStakeAmount and delegations
        nestedValidators.forEach((v => {
            if (v.delegators) {
                if (v.delegators.length > 0) {
                    let delegatedStake = 0;
                    // eslint-disable-next-line
                    v.delegators.forEach(d => delegatedStake += d.stakeAmount!);
                    // eslint-disable-next-line
                    v.totalStakeAmount! += delegatedStake;
                }
                return [];
            }
        }));

        return [nestedValidators, delegations];
    }
    
    /** 
     *  Sort by stake or weight and add rank
     */
    private sortByStake(validators: IValidator[], id: string): IValidator[] {
        (id === AVALANCHE_SUBNET_ID) ?
            validators.sort((a, b) => (b.totalStakeAmount as number) - (a.totalStakeAmount as number)) :
            validators.sort((a, b) => (b.weight as number) - (a.weight as number));
        validators.forEach((v, i) => v.rank = i + 1);
        return validators;
    }

    /** 
     *  Elapsed staking period (%)
     */
    private getElapsedStakingPeriod(validator:IValidator): number {
        let currentTime = new Date().getTime();
        let numerator = currentTime - validator.startTime.getTime();
        let denominator = validator.endTime.getTime() - validator.startTime.getTime();
        return Math.round((numerator / denominator) * 100);
    }
}
