import {
    Caption1,
    Card,
    CardHeader,
    Link,
    Title3
} from '@fluentui/react-components';
import styles from './AssignmentCard.module.css';
import {TierChip} from '@/components';
import {type Tier, type UserTier} from "codetierlist-types";

export declare interface AssignmentCardProps {
    id: string
    name: string
    dueDate?: Date
    tier: UserTier | Tier
}

export const AssignmentCard = ({
    id,
    name,
    dueDate,
    tier
}: AssignmentCardProps): JSX.Element => {
    return (
        <Link href={`/assignments/${id}`} className={styles.cardLink}>
            <Card className={styles.card}>
                <CardHeader
                    header={(<TierChip tier={tier}/>)}
                >
                </CardHeader>
                <div className={styles.cardContent}>
                    {dueDate ?
                        <Caption1>{dueDate.toLocaleDateString()}</Caption1> : null}
                    <Title3>{name}</Title3>
                </div>
            </Card>
        </Link>
    );
};
